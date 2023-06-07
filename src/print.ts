import assert from "assert"
import { AbstractValue, AbstractValueID, DataDependencies, RegionID, abstract_exec_program, process_file } from "./tealift"
import type { BasicBlock, BasicBlockIndex, Instruction, InstructionIndex, JSONifiedProgram, OperationName, PhiIndex, Terminal, TerminalOperationName } from "./json_output_types"
import { format_jsonified_program } from "./format_jsonified_program"

function is_terminal(instruction: { op: OperationName | TerminalOperationName }): instruction is Terminal {
	return instruction.op === 'switch-on-zero' || instruction.op === 'exit'
}

function is_not_instruction(value: AbstractValue) {
	return value.op === 'phi' || value.op === 'region' || value.op === 'on'
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
			cfg_edges.get(outgoing_idx)!.incoming.push(basic_block_idx)
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
		load_global: () => [],
		store_global: () => [],
		delete_global: () => [],
		load_local: () => [],
		store_local: () => [],
		delete_local: () => [],
		load_scratch: (value) => [value.key],
		store_scratch: (value) => [value.key],
		hash: (value) => [value.algo],
		call: (value) => [value.proc_label],
		'call-result': (value) => [value.result_idx],
		phi: () => [],
		// CFG Operations
		region: () => [],
		'switch-on-zero': () => [],
		on: () => [],
		arg: (value) => [value.idx],
		exit: (value) => [value.label],
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
		for (const phi_hash of region.phis) {
			const value = values.get(phi_hash)!
			const idx = hash_to_idx.get(phi_hash)!
			const phi_array_idx = ~idx
			const phi_options: InstructionIndex[] = []
			basic_block.phis[phi_array_idx] = phi_options
			for (const [consumed_region_id_str, consumed_value_hash] of Object.entries<number>(value.consumes)) {
				const consumed_region_id = parseInt(consumed_region_id_str)
				const consumed_basic_block_idx = region_id_to_basic_block_idx.get(consumed_region_id)!
				const predecessor_idx = basic_block.incoming_edges.indexOf(consumed_basic_block_idx)
				assert(predecessor_idx !== -1, "Internal Error: phi node has value for an impossible predecessor")
				const consumed_idx = hash_to_idx.get(consumed_value_hash)!
				phi_options[predecessor_idx] = consumed_idx
			}
		}
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
			assert(basic_block.outgoing_edges.length === 1, "Internal Error: No terminal operation found but basic block has multiple destinations")
		}
	}
	return jsonified_program
}

if (require.main === module) {
	const file = process.argv[2]
	if (file === undefined) {
		console.log('Usage:', process.argv[0], process.argv[1], '<teal-file>')
		process.exit(1)
	}

	const program = build_jsonified_program(file)
	console.log(JSON.stringify(program, null, 2))
	console.log(format_jsonified_program(program))
}
