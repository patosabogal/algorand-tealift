import assert from "assert"
import { AbstractValue, AbstractValueID, DataDependencies, RegionID, abstract_exec_program, process_file } from "./tealift"

/**
 * // Format
 * {
 *   entrypoint: <idx_into_bbs>
 *   basic_blocks: [
 *     {
 *       incoming_edges: [<idx_into_bbs>],
 *       outgoing_edges: [<idx_into_bbs>],
 *       // phis[i][j] is the value for the i-th phi when coming from incoming_edges[j]
 *       phis: [[<idx_into_bb_instructions>]],
 *       instructions: [
 *         {
 *           op: <operation_name>,
 *           args: [<operation_arguments>],
 *           // phi values are encoded as -i-1
 *           consumes: [<idx_into_bb_instructions> | <negative_idx_into_phis>]
 *         }
 *       ],
 *       terminal: {
 *         op: <terminal_name>,
 *         args: [<operation_arguments>],
 *         consumes: [<idx_into_bb_instructions> | <negative_idx_into_phis>],
 *       }
 *     }
 *   ]
 * }
 */
type JSONifiedProgram = {
	entrypoint: BasicBlockIndex
	basic_blocks: BasicBlock[]
}
type BasicBlockIndex = number
type BasicBlock = {
	incoming_edges: BasicBlockIndex[]
	outgoing_edges: BasicBlockIndex[]
    // phis[i][j] is the value for the i-th phi when coming from incoming_edges[j]
	phis: InstructionIndex[][]
	instructions: Instruction[]
	terminal: Terminal
}
type InstructionIndex = number
type Instruction = {
	op: OperationName
	args: OperationArguments[]
	consumes: (InstructionIndex | PhiIndex)[]
}
type OperationName = string
type OperationArguments = any
type PhiIndex = number
type Terminal = {
	op: TerminalOperationName
	args: OperationArguments[]
	consumes: (InstructionIndex | PhiIndex)[]
}
type TerminalOperationName = string

function is_terminal(instruction: { op: OperationName | TerminalOperationName }): instruction is Terminal {
	return instruction.op === 'switch' || instruction.op === 'exit'
}

function is_not_instruction(value: AbstractValue) {
	return value.op === 'phi' || value.op === 'region' || value.op === 'switch' || value.op === 'on' || value.op === 'exit' || value.op === 'sequence_point'
}

const build_jsonified_program = (filename: string) => {
	const [program, labels] = process_file(filename)
	const [values, regions] = abstract_exec_program(program, labels)

	// BasicBlockIndex => { incoming: BasicBlockIndex[], outgoing: BasicBlockIndex[] }
	const cfg_edges = new Map<BasicBlockIndex, { incoming: BasicBlockIndex[], outgoing: BasicBlockIndex[] }>()
	const region_id_to_basic_block_idx = new Map<RegionID, BasicBlockIndex>()
	const basic_block_idx_to_region_id: Record<BasicBlockIndex, RegionID> = []
	/* Enumerate all basic blocks */ {
		let i = 0;
		for (const region_id of regions.keys()) {
			region_id_to_basic_block_idx.set(region_id, i);
			basic_block_idx_to_region_id[i] = region_id;
			cfg_edges.set(i, { incoming: [], outgoing: [] })
			i++
		}
	}

	/* Build CFG */
	for (const [region_id, region] of regions.entries()) {
		const basic_block_idx = region_id_to_basic_block_idx.get(region_id)!
		const outgoing = region.successors.map(successor_region_id => region_id_to_basic_block_idx.get(successor_region_id)!)
		for (const outgoing_idx of outgoing) {
			cfg_edges.get(outgoing_idx)!.incoming.push(outgoing_idx)
		}
		cfg_edges.get(basic_block_idx)!.outgoing = outgoing
	}

	// ValueHash => InstructionIndex on its containing BasicBlock
	const hash_to_idx = new Map<AbstractValueID, InstructionIndex>()
	for (const region of regions.values()) {
		let idx = 0
		let phis = -1
		for (const value_hash of region.values) {
			const value = values.get(value_hash)!
			// FXIME: List all non-data instructions
			if (value.op === 'phi') {
				hash_to_idx.set(value_hash, phis)
				phis--
			} else if (is_not_instruction(value)) {
				continue
			} else {
				hash_to_idx.set(value_hash, idx)
				idx++
			}
		}
	}

	type ArgsBuilder = (value: AbstractValue) => any[]
	function default_args() {
		return []
	}
	const ssa_args: Record<string, ArgsBuilder> = {
		and: () => [],
		or: () => [],
		add: () => [],
		sub: () => [],
		mul: () => [],
		mod: () => [],
		lt: () => [],
		gt: () => [],
		le: () => [],
		ge: () => [],
		ne: () => [],
		eq: () => [],
		mul_high: () => [],
		mul_low: () => [],
		add_high: () => [],
		add_low: () => [],
		not: () => [],
		concat: () => [],
		cast: (value) => [value.type],
		const: (value) => [value.type, value.value],
		ext_const: (value) => [value.type, value.name],
		global_load: () => ['global'],
		local_load: () => ['local'],
		scratch_load: (value) => ['scratch', value.key],
		hash: (value) => [value.algo],
		call: (value) => [value.proc_label],
		'call-result': (value) => [value.result_idx],
		phi: () => [],
		// CFG Operations
		region: () => [],
		switch: () => [],
		on: () => [],
		arg: (value) => [value.idx],
		exit: (value) => [value.label],
		sequence_point: () => [],
	}

	function jsonify_instruction(value: AbstractValue): Instruction | Terminal {
		const op: string = value.op
		const ssa_get_args = ssa_args[value.op] || default_args
		if (ssa_get_args === default_args)
			console.error(`Unknown abstract operation ${value.op}, using default printer`)
		const args = ssa_get_args(value)
		const consumes = consume_list(value)
		return { op, args, consumes }
	}

	function consume_list(value: AbstractValue): (InstructionIndex | PhiIndex)[] {
		assert(value.op !== 'phi', 'phis should not appear in instruction listings')
		if (value.consumes === undefined) {
			return []
		}
		return Object.values(value.consumes as DataDependencies).map(consumed_hash => {
			const idx = hash_to_idx.get(consumed_hash)
			assert(idx !== undefined, 'Internal Error: consumed hash is not a valid instruction')
			return idx
		})
	}

	const jsonified_program: JSONifiedProgram = {
		entrypoint: 0,
		basic_blocks: []
	}

	for (const [region_id, region] of regions.entries()) {
		const basic_block_idx = region_id_to_basic_block_idx.get(region_id)!
		const basic_block_cfg = cfg_edges.get(basic_block_idx)!
		const basic_block: BasicBlock = {
			incoming_edges: basic_block_cfg.incoming,
			outgoing_edges: basic_block_cfg.outgoing,
			phis: [],
			instructions: [],
			terminal: {
				op: 'uninitialized',
				args: [],
				consumes: []
			}
		}
		jsonified_program.basic_blocks.push(basic_block)
		for (const value_hash of region.values) {
			const value = values.get(value_hash)!
			if (is_not_instruction(value)) {
				continue
			}
			const instruction: Instruction | Terminal = jsonify_instruction(value)
			if (is_terminal(instruction)) {
				assert(basic_block.terminal.op === 'uninitialized', "Internal error: Multiple terminal instructions found on the same block")
				basic_block.terminal = instruction
			} else {
				basic_block.instructions.push(instruction)
			}
		}
		if (basic_block.terminal.op === 'uninitialized') {
			// No terminal operation on the whole region. Insert a fallthrough jump
			basic_block.terminal.op = 'jmp'
		}
	}
	return jsonified_program
}

const file = process.argv[2]
if (file === undefined) {
	console.log('Usage:', process.argv[0], process.argv[1], '<teal-file>')
	process.exit(1)
}

const program = build_jsonified_program(file)
console.log(JSON.stringify(program, null, 2))
