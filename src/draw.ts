import { AbstractValue, AbstractValueID, abstract_exec_program, process_file } from "./tealift"

type DrawSSAOptions = {
	blocks?: boolean
	phi_labels?: boolean
	direction?: 'TD' | 'LR'
}
const draw_ssa = (filename: string, options: DrawSSAOptions) => {
	const [program, labels] = process_file(filename)
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
	const default_printer: AbstractOPRenderer = (value_hash, value) => `"node${value_hash}" [label="${value.op}", color=blue]`
	console.log('//', filename)
	console.log('digraph {')
	console.log(`rankdir=${options.direction || 'TD'}`)
	for (const region of regions.values()) {
		if (options.blocks === true) {
			console.log(`subgraph "cluster${region.name}" {\n`)
			console.log(`label="${region.name}"\n`)
		}
		for (const value_hash of region.values) {
			render_node(value_hash, values.get(value_hash)!)
		}
		if (options.blocks === true) {
			console.log('}')
		}
	}
	for (const [value_hash, value] of values) {
		render_edges(value_hash, value)
	}
	console.log('}')

	function render_node(value_hash: AbstractValueID, value: AbstractValue) {
		const ssa_op = ssa_operations[value.op] || default_printer
		if (ssa_op === default_printer)
			console.error(`Unknown abstract operation ${value.op}, using default printer`)
		console.log(ssa_op(value_hash, value))
	}
	function render_edges(value_hash: AbstractValueID, value: AbstractValue) {
		if (value.op !== 'phi' && value.consumes !== undefined)
			for (const [key, consumed_value] of Object.entries(value.consumes))
				console.log(`"node${consumed_value}" -> "node${value_hash}" [label="${key}"]`)
		if (value.op === 'phi')
			for (const [region_id_key, mapping_value_hash] of Object.entries(value.consumes)) {
				const region_id = parseInt(region_id_key)
				const region = values.get(program.length + region_id + 1)
				if (options.phi_labels === true) {
					console.log(`"node${mapping_value_hash}" -> "node${value_hash}" [label="from ${region.label}"]\n`)
				} else {
					console.log(`"node${mapping_value_hash}" -> "node${value_hash}"\n`)
				}
			}
		if (value.op === 'region') {
			for (const incoming_edge of value.incoming) {
				const cfg_value = values.get(incoming_edge)
				if (cfg_value.op === 'on')
					console.log(`"node${cfg_value.control}" -> "node${value_hash}" [label="${cfg_value.label}", style=dashed]\n`)
				else
					console.log(`"node${incoming_edge}" -> "node${value_hash}" [style=dashed]\n`)
			}
		}
		if (value.op !== 'on' && value.control)
			console.log(`"node${value.control}" -> "node${value_hash}" [style=dashed]\n`)
	}
}

const file = process.argv[2]
if (file === undefined) {
	console.log('Usage:', process.argv[0], process.argv[1], '<teal-file>', '[--no-blocks]', '[--no-phi-labels]', '[--dir=TD|LR]')
	process.exit(1)
}

const blocks = process.argv.slice(3).every(v => v !== '--no-blocks')
const phi_labels = process.argv.slice(3).every(v => v !== '--no-phi-labels')
const direction = (process.argv.slice(3).find(v => v === '--dir=TD' || v === '--dir=LR')?.slice('--dir='.length) || 'TD') as 'TD' | 'LR'

draw_ssa(file, { blocks, phi_labels, direction })