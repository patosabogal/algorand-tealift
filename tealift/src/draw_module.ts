import { AbstractValue, AbstractValueID, abstract_exec_program, process_contents } from "./tealift"

export type DrawSSAOptions = {
	blocks?: boolean
	phi_labels?: boolean
	direction?: 'TD' | 'LR'
}
export const draw_ssa = (contents: string, filename: string, options: DrawSSAOptions): string => {
	let result: string = ''
	const [program, labels] = process_contents(contents, filename)
	const [values, regions] = abstract_exec_program(program, labels)

	type AbstractOPRenderer = (value_hash: AbstractValueID, value: AbstractValue) => string
	const binop = (label: string): AbstractOPRenderer => (value_hash) => `node${value_hash} [label="${label}", shape=circle]\n`
	const ssa_operations: Record<string, AbstractOPRenderer> = {
		and: binop('&&'),
		or: binop('||'),
		add: binop('+'),
		sub: binop('-'),
		mul: binop('*'),
		mod: binop('%'),
		lt: binop('<'),
		gt: binop('>'),
		le: binop('<'),
		ge: binop('>'),
		ne: binop('!='),
		eq: binop('=='),
		mul_high: binop('* high'),
		mul_low: binop('* low'),
		add_high: binop('+ high'),
		add_low: binop('+ low'),
		not: (value_hash) => `"node${value_hash}" [label="Not"]`,
		concat: binop('Concat'),
		cast: (value_hash, value) => `"node${value_hash}" [label="As ${value.type}"]\n`,
		const: (value_hash, value) => `"node${value_hash}" [label="${value.value}: ${value.type}", shape=rectangle]\n`,
		ext_const: (value_hash, value) => `"node${value_hash}" [label="${value.name}: ${value.type}", shape=diamond]\n`,
		global_load: (value_hash) => `"node${value_hash}" [label="Load Global", shape=diamond]\n`,
		local_load: (value_hash) => `"node${value_hash}" [label="Load Local", shape=diamond]\n`,
		scratch_load: (value_hash, value) => `"node${value_hash}" [label="Load Scratch(${value.key})", shape=diamond]\n`,
		hash: (value_hash, value) => `node${value_hash} [label="Hash ${value.algo}"]\n`,
		call: (value_hash, value) => `node${value_hash} [label="Call(${value.proc_label})"]\n`,
		'call-result': (value_hash, value) => `node${value_hash} [label="Result(${value.result_idx})"]\n`,
		phi: (value_hash) => `"node${value_hash}" [label="ϕ", shape=circle]\n`,
		// CFG Operations
		region: (value_hash, value) => {
			let result = `"node${value_hash}" [label="Region(${value.label})", color=red]\n`
			return result
		},
		switch: (value_hash) => `"node${value_hash}" [label="Switch", color=red]\n`,
		on: () => '',
		arg: (value_hash, value) => `"node${value_hash}" [label="Arg(${value.idx})"]\n`,
		exit: (value_hash, value) => `"node${value_hash}" [label="${value.label}", color=red]\n`,
		sequence_point: (value_hash, value) => `"node${value_hash}" [label="${value.label || ''}", color=red]\n`,
	}
	const default_printer: AbstractOPRenderer = (value_hash, value) => `"node${value_hash}" [label="${value.op}", color=blue]\n`
	result += `// ${filename}\n`
	result += 'digraph {\n'
	result += `rankdir=${options.direction || 'TD'}\n`
	for (const region of regions.values()) {
		if (options.blocks === true) {
			result += `subgraph "cluster${region.name}" {\n`
			result += `label="${region.name}"\n`
		}
		for (const value_hash of region.values) {
			result += render_node(value_hash, values.get(value_hash)!)
		}
		if (options.blocks === true) {
			result += '}\n'
		}
	}
	for (const [value_hash, value] of values) {
		result += render_edges(value_hash, value)
	}
	result += '}\n'

	function render_node(value_hash: AbstractValueID, value: AbstractValue): string {
		const ssa_op = ssa_operations[value.op] || default_printer
		if (ssa_op === default_printer)
			console.error(`Unknown abstract operation ${value.op}, using default printer`)
		return ssa_op(value_hash, value)
	}
	function render_edges(value_hash: AbstractValueID, value: AbstractValue): string {
		let edges = ''
		if (value.op !== 'phi' && value.consumes !== undefined)
			for (const [key, consumed_value] of Object.entries(value.consumes))
				edges += `"node${consumed_value}" -> "node${value_hash}" [label="${key}"]\n`
		if (value.op === 'phi')
			for (const [region_id_key, mapping_value_hash] of Object.entries(value.consumes)) {
				const region_id = parseInt(region_id_key)
				const region = values.get(program.length + region_id + 1)
				if (options.phi_labels === true) {
					edges += `"node${mapping_value_hash}" -> "node${value_hash}" [label="from ${region.label}"]\n`
				} else {
					edges += `"node${mapping_value_hash}" -> "node${value_hash}"\n`
				}
			}
		if (value.op === 'region') {
			for (const incoming_edge of value.incoming) {
				const cfg_value = values.get(incoming_edge)
				if (cfg_value.op === 'on')
					edges += `"node${cfg_value.control}" -> "node${value_hash}" [label="${cfg_value.label}", style=dashed]\n`
				else
					edges += `"node${incoming_edge}" -> "node${value_hash}" [style=dashed]\n`
			}
		}
		if (value.op !== 'on' && value.control)
			edges += `"node${value.control}" -> "node${value_hash}" [style=dashed]\n`
		return edges
	}
	return result
}