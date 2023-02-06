import assert from "assert"
import { AbstractValue, AbstractValueID, abstract_exec_program, DataDependencies, get_list, process_file } from "./tealift"

const print_ssa = (filename: string) => {
	const [program, labels] = process_file(filename)
	const [values, regions] = abstract_exec_program(program, labels)

	const switch_projections = new Map<AbstractValueID, [string, string][]>()
	for (const region of regions.values()) {
		for (const value_hash of region.values) {
			const value = values.get(value_hash)!
			if (value.op !== 'region') {
				continue
			}
			for (const incoming of value.incoming) {
				const projection = values.get(incoming)!
				if (projection.op !== 'on') {
					continue
				}
				get_list(switch_projections, projection.control).push([projection.label, region.name])
			}
		}
	}

	type AbstractOPPrinter = (value: AbstractValue) => string
	function default_printer(value: AbstractValue) {
		return value.op
	}
	const ssa_operations: Record<string, AbstractOPPrinter> = {
		and: () => 'and',
		or: () => 'or',
		add: () => 'add',
		sub: () => 'sub',
		mul: () => 'mul',
		mod: () => 'mod',
		lt: () => 'lt',
		gt: () => 'gt',
		le: () => 'le',
		ge: () => 'ge',
		ne: () => 'ne',
		eq: () => 'eq',
		mul_high: () => 'mul_high',
		mul_low: () => 'mul_low',
		add_high: () => 'add_high',
		add_low: () => 'add_low',
		not: () => 'not',
		concat: () => 'concat',
		cast: (value) => `cast to=${value.type}`,
		const: (value) => `const type=${value.type} value=${value.value}`,
		ext_const: (value) => `ext type=${value.type} symbol=${value.name}`,
		global_load: () => 'load namespace=global',
		local_load: () => 'load namespace=local',
		scratch_load: ( value) => `load namespace=scratch key=${value.key}`,
		hash: (value) => `hash algo=${value.algo}`,
		call: (value) => `call ${value.proc_label}`,
		'call-result': (value) => `call-result index=${value.result_idx}`,
		phi: () => 'phi',
		// CFG Operations
		region: () => '',
		switch: () => 'switch',
		on: () => '',
		arg: (value) => `call-arg index=${value.idx}`,
		exit: (value) => `exit label=${value.label}`,
		sequence_point: () => ``,
	}

	function print_node(value_hash: AbstractValueID, value: AbstractValue) {
		const ssa_op = ssa_operations[value.op] || default_printer
		if (ssa_op === default_printer)
			console.error(`Unknown abstract operation ${value.op}, using default printer`)
		const op_text = ssa_op(value)
		const consume_text = consume_list(value_hash, value)
		if (op_text === '') {
			assert(consume_text === '', 'Operations with no rendering should not consume values')
			return
		}
		console.log(`%${value_hash} = ${op_text}${consume_text}`)
	}

	function consume_list(value_hash: AbstractValueID, value: AbstractValue) {
		if (value.consumes === undefined) {
			return ''
		}
		const consumes: DataDependencies = value.consumes
		let result = ''
		for (const key in consumes) {
			result += value.op === 'phi'
					? ` ${regions.get(parseInt(key))!.name}=%${consumes[key]}`
					: ` ${key}=%${consumes[key]}`
		}
		if (value.op === 'switch') {
			const projections = switch_projections.get(value_hash)
			assert(projections !== undefined, "Switch doesn't have projections!")
			for (const [label, destination] of projections) {
				result += ` ${label}=<${destination}>`
			}
		}
		return result
	}

	console.log('//', filename)
	for (const region of regions.values()) {
		console.log(`${region.name}:`)
		for (const value_hash of region.values) {
			print_node(value_hash, values.get(value_hash)!)
		}
		if (region.successors.length === 1) {
			const successor = regions.get(region.successors[0]!)!
			console.log(`jmp dst=<${successor.name}>`)
		}
	}
}

const file = process.argv[2]
if (file === undefined) {
	console.log('Usage:', process.argv[0], process.argv[1], '<teal-file>')
	process.exit(1)
}

print_ssa(file)