import assert, { fail } from 'assert'
import txn_fields from './txn_fields'
import txna_fields from './txna_fields'
import asset_holding_fields from './asset_holding_fields'

type TxnFieldName = keyof typeof txn_fields
type TxnaFieldName = keyof typeof txna_fields
type AssetHoldingFieldName = keyof typeof asset_holding_fields

const uint64 = 'uint64'
const bytearray = '[]byte'
const any = 'any'
const next = ':next'

// FIXME: Use stronger types
type Label = string
type AbstractValue = any
type AbstractValueID = number
type RegionID = number
type InstructionID = number
type DataDependencies = Record<string, AbstractValueID>
type LabelMapping = Map<string, InstructionID>

interface InstructionDescription {
	next(...args: any): Label[]
	exec(ctx: AbstractExecutionContext, ...args: any): NextStepDescription
}

interface AbstractExecutionContext {
	push(value: AbstractValue): AbstractValueID
	push_handle(value_hash: AbstractValueID): AbstractValueID
	pop(): AbstractValueID
	sequence_point(label: string, consumes: DataDependencies): AbstractValueID
	add_value(value: AbstractValue): AbstractValueID
	resolve_label(label: string, case_name?: string): JumpDescription
	call_to(proc_label: string): void
	get last_sequence_point(): AbstractValueID
}

type JumpDescription   = { kind: 'jump', label: string, instruction_idx: InstructionID }
type ExitDescription   = { kind: 'exit', label: string, consumes: DataDependencies}
type SwitchDescription = { kind: 'switch', consumes: DataDependencies, alternatives: JumpDescription[] }

type NextStepDescription = JumpDescription | ExitDescription | SwitchDescription

type InstructionVariant = 'uint64' | '[]byte' | 'none'

function binop(abstract_op: string, variant='none' as InstructionVariant): InstructionDescription {
	return {
		next: () => [next],
		exec(ctx) {
			const rhs = ctx.pop()
			const lhs = ctx.pop()
			ctx.push({ op: abstract_op, consumes: { rhs, lhs }, variant })
			return ctx.resolve_label(next)
		},
	}
}

// FIXME: Better type here
const isn: Record<string, InstructionDescription> = {
	// Signature: any any -- uint64
	'==': binop('eq'),
	'!=': binop('ne'),
	// Signature: uint64 uint64 -- uint64
	'&&': binop('and', uint64),
	'||': binop('or', uint64),
	'+': binop('add', uint64),
	'-': binop('sub', uint64),
	'*': binop('mul', uint64),
	'%': binop('mod'),
	'&': binop('bitand', uint64),
	'<': binop('lt', uint64),
	'>': binop('gt', uint64),
	'>=': binop('gt', uint64),
	'<=': binop('gt', uint64),
	// Signature: []byte []byte -- []byte
	'b+': binop('add', bytearray),
	'b-': binop('sub', bytearray),
	'b*': binop('mul', bytearray),
	'b&': binop('bitand', bytearray),
	'concat': binop('concat'),
	// Signature: []byte []byte -- uint64
	'b<': binop('lt', bytearray),
	'b>': binop('gt', bytearray),
	'b>=': binop('gt', bytearray),
	'b<=': binop('gt', bytearray),
	// Signature: uint64 uint64 -- uint64 uint64
	'addw': {
		next: () => [next],
		exec(ctx) {
			const rhs = ctx.pop()
			const lhs = ctx.pop()
			ctx.push({ op: 'add_high', consumes: { rhs, lhs } })
			ctx.push({ op: 'add_low',  consumes: { rhs, lhs } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 uint64 -- uint64 uint64
	'mulw': {
		next: () => [next],
		exec(ctx) {
			const rhs = ctx.pop()
			const lhs = ctx.pop()
			ctx.push({ op: 'mul_high', consumes: { rhs, lhs } })
			ctx.push({ op: 'mul_low',  consumes: { rhs, lhs } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 -- uint64
	'!': {
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			ctx.push({ op: 'not', consumes: { value } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: []byte -- uint64
	'btoi': {
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			ctx.push({ op: 'cast', type: uint64, consumes: { value } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 -- []byte
	'itob': {
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			ctx.push({ op: 'cast', type: bytearray, consumes: { value } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: []byte -- []byte
	'sha512_256': {
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			ctx.push({ op: 'hash', algo: 'sha512_256', consumes: { value } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: -- []byte
	'addr': {
		next: () => [next],
		exec(ctx, value) {
			ctx.push({ op: 'const', type: bytearray, value })
			return ctx.resolve_label(next)
		},
	},
	// Signature: -- []byte
	'byte': {
		next: () => [next],
		exec(...args) {
			const ctx = args[args.length - 1]
			const instruction_params = args.slice(0, -1)
			// FIXME: Parse value
			ctx.push({ op: 'const', type: bytearray, value: instruction_params.join(' ').replace(/"/g, '\\"') })
			return ctx.resolve_label(next)
		},
	},
	// Signature: -- []byte
	'pushbytes': {
		next: () => [next],
		exec(...args) {
			const ctx = args[args.length - 1]
			const instruction_params = args.slice(0, -1)
			// FIXME: Parse value
			ctx.push({ op: 'const', type: bytearray, value: instruction_params.join(' ').replace(/"/g, '\\"') })
			return ctx.resolve_label(next)
		},
	},
	// Signature: --
	'b': {
		next: (label) => [label],
		exec(ctx, label) {
			return ctx.resolve_label(label, 'jump')
		},
	},
	// Signature: uint64 --
	'bnz': {
		next: (label) => [label, next],
		exec(ctx, label) {
			const condition = ctx.pop()
			return {
				kind: 'switch',
				consumes: { condition },
				alternatives: [ctx.resolve_label(next, 'zero'), ctx.resolve_label(label, 'non-zero')]
			}
		},
	},
	// Signature: any -- any any
	'dup': {
		next: () => [next],
		exec(ctx) {
			const value_handle = ctx.pop()
			ctx.push_handle(value_handle)
			ctx.push_handle(value_handle)
			return ctx.resolve_label(next)
		}
	},
	// Signature: any any -- any any
	'swap': {
		next: () => [next],
		exec(ctx) {
			const a = ctx.pop()
			const b = ctx.pop()
			ctx.push_handle(a)
			ctx.push_handle(b)
			return ctx.resolve_label(next)
		}
	},
	// Signature: any ... n items ... -- any ... n items ... any
	'dig': {
		next: () => [next],
		exec(ctx, amount) {
			amount = parseInt(amount)

			const stack: AbstractValueID[] = []
			while (0 <= amount--)
				stack.unshift(ctx.pop())
			for (const v of stack)
				ctx.push_handle(v)
			ctx.push_handle(stack[0]!)
			return ctx.resolve_label(next)
		}
	},
	// Signature: ... n items ... any -- any ... n items ...
	'cover': {
		next: () => [next],
		exec(ctx, amount) {
			amount = parseInt(amount)

			const stack: AbstractValueID[] = []
			while (0 < amount--)
				stack.unshift(ctx.pop())
			if (stack.length > 0) {
				stack.unshift(stack.pop()!)
				for (const v of stack)
					ctx.push_handle(v)
			}
			return ctx.resolve_label(next)
		}
	},
	// Signature: any ... n items ... -- ... n items ... any
	'uncover': {
		next: () => [next],
		exec(ctx, amount) {
			amount = parseInt(amount)

			const stack: AbstractValueID[] = []
			while (0 < amount--)
				stack.unshift(ctx.pop())
			if (stack.length > 0) {
				stack.push(stack.shift()!)
				for (const v of stack)
					ctx.push_handle(v)
			}
			return ctx.resolve_label(next)
		}
	},
	// FIXME: Is this the correct model?
	// Maybe we should use abstract get/set with bit and byte variants
	// Signature: []byte uint64 -- uint64
	'getbyte': binop('getbyte'),
	// Signature: []byte uint64 uint64 -- []byte
	'setbyte': {
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			const index = ctx.pop()
			const bytes = ctx.pop()
			ctx.push({ op: 'setbyte', consumes: { bytes, index, value } })
			return ctx.resolve_label(next)
		}
	},
	// Signature: any --
	'pop': {
		next: () => [next],
		exec(ctx) {
			ctx.pop()
			return ctx.resolve_label(next)
		}
	},
	// Signature: --
	'err': {
		next: () => [],
		exec() {
			return {
				kind: 'exit',
				label: 'err',
				consumes: {}
			}
		},
	},
	// Signature: -- any
	'global': {
		next: () => [next],
		exec(ctx, name) {
			ctx.push({ op: 'ext_const', type: any, name: `global.${name}` })
			return ctx.resolve_label(next)
		},
	},
	// Signature: -- any
	'gtxn': {
		next: () => [next],
		exec(ctx, txn, field: TxnFieldName) {
			ctx.push({ op: 'ext_const', type: txn_fields[field].type || any, name: `gtxn[${txn}].${field}` })
			return ctx.resolve_label(next)
		},
	},
	// Signature: -- any
	'txn': {
		next: () => [next],
		exec(ctx, field: TxnFieldName) {
			ctx.push({ op: 'ext_const', type: txn_fields[field].type || any, name: `txn.${field}` })
			return ctx.resolve_label(next)
		},
	},
	// Signature: -- any
	'txna': {
		next: () => [next],
		exec(ctx, field: TxnaFieldName, idx) {
			ctx.push({ op: 'ext_const', type: txna_fields[field].type || any, name: `txn.${field}[${idx}]` })
			return ctx.resolve_label(next)
		},
	},
	// Signature: []byte uint64 -- any
	'asset_holding_get': {
		next: (_field) => [next],
		exec(ctx, field: AssetHoldingFieldName) {
			const asset = ctx.pop()
			const account = ctx.pop()
			ctx.push({ op: 'ext_const', type: asset_holding_fields[field].type || any, name: `Asset.${field}`, consumes: { account, asset } })
			ctx.push({ op: 'opted_in', consumes: { account, asset } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: -- uint64
	'int': {
		next: () => [next],
		exec(ctx, value) {
			ctx.push({ op: 'const', type: uint64, value: parseInt(value) || value })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 --
	'return': {
		next: () => [],
		exec(ctx) {
			const value = ctx.pop()
			return {
				kind: 'exit',
				label: 'return',
				consumes: { value }
			}
		},
	},
	// Signature: byte[] -- any
	'app_global_get': {
		next: () => [next],
		exec(ctx) {
			const key = ctx.pop()
			ctx.push({ op: 'global_load', type: any, name: 'Global', consumes: { key } , control: ctx.last_sequence_point })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 byte[] -- any
	'app_local_get': {
		next: () => [next],
		exec(ctx) {
			const key = ctx.pop()
			const account = ctx.pop()
			ctx.push({ op: 'local_load', type: any, name: 'Local', consumes: { key, account }, control: ctx.last_sequence_point })
			return ctx.resolve_label(next)
		},
	},
	// Signature: byte[] any --
	'app_global_put': {
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			const key = ctx.pop()
			ctx.sequence_point('Store Global', { key, value })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 byte[] any --
	'app_local_put': {
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			const key = ctx.pop()
			const account = ctx.pop()
			ctx.sequence_point('Store Local', { account, key, value })
			return ctx.resolve_label(next)
		},
	},
	// Signature: byte[] --
	'app_global_del': {
		next: () => [next],
		exec(ctx) {
			const key = ctx.pop()
			ctx.sequence_point('Delete Global', { key })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 byte[] --
	'app_local_del': {
		next: () => [next],
		exec(ctx) {
			const key = ctx.pop()
			const account = ctx.pop()
			ctx.sequence_point('Delete Global', { account, key })
			return ctx.resolve_label(next)
		},
	},
	// Signature: -- any
	'load': {
		next: () => [next],
		exec(ctx, key) {
			// FIXME: We should SSA these
			ctx.push({ op: 'scratch_load', key, control: ctx.last_sequence_point })
			return ctx.resolve_label(next)
		},
	},
	// Signature: any --
	'store': {
		next: () => [next],
		exec(ctx, key) {
			// FIXME: We should SSA these
			const value = ctx.pop()
			ctx.sequence_point(`Store Scratch(${key})`, { value })
			return ctx.resolve_label(next)
		},
	},
	'callsub': {
		next: () => [next],
		exec(ctx, proc_label) {
			ctx.call_to(proc_label)
			return ctx.resolve_label(next)
		}
	},
	'retsub': {
		next: () => [],
		exec() {
			// FIXME: We should assert that the stack depth has to be statically known here!
			//const consumes = ctx.popall()
			const consumes = {}
			return {
				kind: 'exit',
				label: 'retsub',
				consumes,
			}
		}
	}
}

type ParsedInstruction = {
	type: 'operation'
	operation: string
	args: any[]
	filename: string
	linenum: number
	labels: string[]
}
type Program = ParsedInstruction[]

interface SourceLocation {
	get filename(): string
	get linenum(): number
}

const parse = (filename: string, contents: string): Program => {
	type ParsedLabel = {
		type: 'label'
		labels: string[]
	}


	// Each program ends up with an implict return
	return (contents + "\nreturn\n")
		.split('\n')
		// Remove comments
		.map(v => v.replace(/\/\/.*$/, ''))
		// Remove pragmas
		.map(v => v.replace(/^\s*#pragma.*/, ''))
		// Remove whitespace
		.map(v => v.trim())
		// Number each line
		.map((line, linenum) => ({ line, linenum }))
		// Filter empty lines
		.filter(v => v.line != '')
		// Categorize lines
		.map(({ line, linenum }) => {
			let [operation, ...args] = line.split(/\s+/)
			let type: 'label' | 'operation'

			assert(operation !== undefined, `No operation found in line ${linenum}`)
			if (operation.endsWith(':')) {
				operation = operation.slice(0, -1)
				type = 'label'
			} else {
				type = 'operation'
			}
			return { type, operation, args, linenum }
		})
		// Bind labels to their corresponding instruction
		.reduce((acc, { type, operation, args, linenum }) => {
			const is_preceded_by_label =
				acc.length > 0
				&& acc[acc.length - 1]!.type === 'label'

			let new_instruction: ParsedInstruction | ParsedLabel
			if (type === 'operation') {
				new_instruction = { type, operation, args, filename, linenum, labels: [] }
			} else if (type === 'label') {
				new_instruction = { type, labels: [operation] }
			} else {
				throw new Error('Parser Error: Unknown line type')
			}

			if (is_preceded_by_label) {
				const labels = acc.pop()!.labels
				new_instruction.labels.push(...labels)
			}

			acc.push(new_instruction)
			return acc
		}, [] as (ParsedInstruction | ParsedLabel)[]) as Program
}

const format_location = (location: SourceLocation) => `${location.filename}:${location.linenum}`

const gather_labels = (program: Program): LabelMapping => {
	const labels = new Map<string, InstructionID>()
	program.forEach((instruction, idx) => {
		for (const label of instruction.labels) {
			const previous_idx = labels.get(label)
			if (previous_idx !== undefined) {
				const previous = program[previous_idx]!
				console.error('Label', label, 'was redefined!')
				console.error('  Previous definition at ', format_location(previous))
				console.error('  New definition at ', format_location(instruction))
			}
			labels.set(label, idx)
		}
	})
	return labels
}

function* enumerate<T>(iterable: Iterable<T>): Iterable<[T, number]> {
	let i = 0
	for (const v of iterable)
		yield [v, i++]
}

function range(to: number): Iterable<number>
function range(from: number, to: number): Iterable<number>
function range(from: number, to: number, step: number): Iterable<number>
function* range(from: number, to?: number, step?: number) {
	if (to === undefined)
		[to, from] = [from, 0]
	if (step === undefined)
		step = 1
	for (let i = from; i < to; i += step)
		yield i
}

const get_list = <K, V>(map: Map<K, V[]>, key: K): V[] => {
	let result = map.get(key)
	if (result === undefined) {
		result = []
		map.set(key, result)
	}
	return result
}

const process_file = (filename: string): [Program, LabelMapping] => {
	const { readFileSync } = require('fs')
	const contents = readFileSync(filename, 'utf8')
	const program = parse(filename, contents)
	const labels = gather_labels(program)
	return [program, labels]
}

const format_instruction = (ins: ParsedInstruction) =>
	`${ins.linenum.toString().padStart(4)} | ${ins.operation} ${ins.args.join(' ')}`
const dump_program = (program: Program) =>
	program.forEach(v => {
		v.labels.forEach(label => console.log(`     | ${label}:`))
		console.log(format_instruction(v))
	})

const abstract_exec_program = (program: Program, labels: LabelMapping) => {
	type RegionInfo = {
		pops: number
		pushes: AbstractValueID[]
		exit_stack: AbstractValueID[]
	}
	type FunctionID = number
	type FunctionInfo = {
		status: 'in-progress' | 'done',
		pops: number,
		pushes: number
	}

	const constants = new Map<string, AbstractValueID>()
	const values = new Map<AbstractValueID, AbstractValue>()
	// First instruction of the region => ID of first sequence point
	const regions = new Map<RegionID, AbstractValueID>()
	const regions_info = new Map<RegionID, RegionInfo>()
	const functions_info = new Map<FunctionID, FunctionInfo>()
	values.set(0, { op: 'start' })

	const successors_of = (idx: InstructionID) => {
		const instruction = program[idx]!
		const successor_labels =
			isn[instruction.operation]?.next(...instruction.args)
			|| warn_and_default(instruction)
		return successor_labels.map(label => {
			const label_idx = label === next
				? idx + 1
				: labels.get(label)
			assert(label_idx !== undefined, `Destination for label '${label}' not found!`)
			assert(label_idx < program.length, 'Program control fell out of bounds!')
			return label_idx
		})
	}

	// Maps instruction_idx => previous_instruction_idx
	const predecessors = new Map<InstructionID, InstructionID[]>()
	const predecessors_of = (instruction_idx: InstructionID) => get_list(predecessors, instruction_idx)
	for (const predecessor_idx of range(program.length))
		for (const successor_idx of successors_of(predecessor_idx))
			predecessors_of(successor_idx).push(predecessor_idx)

	// Maps region id of region => successors
	const region_successors = new Map<RegionID, RegionID[]>()

	const run_from = (instruction_idx: InstructionID, is_procedure=true) => {
		const function_id = instruction_idx
		if (functions_info.has(function_id)) {
			const result = functions_info.get(function_id)!
			assert(result.status === 'done', 'Recursive functions are not supported')
			return result
		}
		const result: FunctionInfo = {
			status: 'in-progress',
			pops: 0,
			pushes: 0
		}
		functions_info.set(function_id, result)

		const exit_points: AbstractValueID[] = []
		const instruction_queue = [{ from_value_hash: 0, to_instruction_idx: instruction_idx }]
		// FIXME: Report if two basic blocks push too-much
		while (instruction_queue.length !== 0) {
			const jump_destination = instruction_queue.pop()!
			const region_id = jump_destination.to_instruction_idx
			let instruction_idx = jump_destination.to_instruction_idx

			let symbolic_stack: AbstractValueID[] = []
			let used_from_caller = 0
			let value_id = 1

			const ctx: AbstractExecutionContext = {
				push(value) {
					let value_key: string
					if (value.op === 'const' || value.op === 'ext_const') {
						value_key = value.op === 'const'
							? `${value.op};${value.type};${value.value}`
							: `${value.op};${value.type};${value.name}`
						let constant_hash = constants.get(value_key)
						if (constant_hash !== undefined) {
							symbolic_stack.push(constant_hash)
							return constant_hash
						}
					}

					const value_hash = this.add_value(value)
					symbolic_stack.push(value_hash)

					if (value.op === 'const' || value.op === 'ext_const')
						constants.set(value_key!, value_hash)

					return value_hash
				},
				push_handle(value_hash) {
					symbolic_stack.push(value_hash)
					return value_hash
				},
				pop() {
					if (symbolic_stack.length > 0)
						return symbolic_stack.pop()!

					const phi_hash = program.length * -++used_from_caller + region_id
					values.set(phi_hash, { op: 'phi', consumes: {}, control: region_value_hash })
					return phi_hash
				},
				sequence_point(label, consumes) {
					last_sequence_point = this.add_value({ op: 'sequence_point', consumes, control: last_sequence_point, label })
					return last_sequence_point
				},
				add_value(value) {
					const value_hash = program.length * value_id++ + (region_id + 1)
					values.set(value_hash, value)
					return value_hash
				},
				resolve_label(label, case_name='') {
					const label_idx = resolve_label_idx(label, instruction_idx)
					return { kind: 'jump', label: case_name, instruction_idx: label_idx }
				},
				call_to(proc_label) {
					const label_idx = resolve_label_idx(proc_label, instruction_idx)
					const { pops, pushes } = run_from(label_idx, true)

					const consumes: DataDependencies = {}
					for (const i of range(pops))
						consumes[i] = ctx.pop()

					last_sequence_point = this.add_value({ op: 'call', consumes, control: last_sequence_point, proc_label})

					for (const result_idx of range(pushes))
						ctx.push({ op: 'call-result', consumes: { call: last_sequence_point }, result_idx })
				},
				get last_sequence_point() {
					return last_sequence_point
				}
			}

			let last_sequence_point: AbstractValueID
			/* Add region start */ {
				const region = regions.get(region_id)
				if (region !== undefined) {
					values.get(region).incoming.add(jump_destination.from_value_hash)
					continue
				}

				const label = program[instruction_idx]?.labels[0] || region_id.toString()
				last_sequence_point = ctx.add_value({ op: 'region', incoming: new Set([jump_destination.from_value_hash]), label })
				regions.set(region_id, last_sequence_point)
			}
			const region_value_hash = last_sequence_point

			region_loop: while (true) {
				const instruction = program[instruction_idx]!
				const successors = isn[instruction.operation]?.exec(ctx, ...instruction.args) || fail('Unknown operation: ' + instruction.operation)

				switch (successors.kind) {
				case 'exit':
					last_sequence_point = ctx.add_value({ op: 'exit', control: last_sequence_point, label: successors.label, consumes: successors.consumes })
					exit_points.push(last_sequence_point)
					region_successors.set(region_id, [])
					break region_loop
				case 'switch':
					last_sequence_point = ctx.add_value({ op: 'switch', control: last_sequence_point, consumes: successors.consumes })

					for (const alternative of successors.alternatives) {
						const projection_hash = ctx.add_value({ op: 'on', control: last_sequence_point, label: alternative.label })
						instruction_queue.push({ from_value_hash: projection_hash, to_instruction_idx: alternative.instruction_idx })
					}
					region_successors.set(region_id, successors.alternatives.map(v => v.instruction_idx))
					break region_loop
				case 'jump':
					instruction_idx = successors.instruction_idx

					if (predecessors_of(instruction_idx).length > 1) {
						instruction_queue.push({ from_value_hash: last_sequence_point, to_instruction_idx: instruction_idx })
						region_successors.set(region_id, [instruction_idx])
						break region_loop
					}
					break
				default:
					throw new Error('Unknown CFG operation ' + (successors as any).kind)
				}
			}

			regions_info.set(region_id, {
				pops: used_from_caller,
				pushes: symbolic_stack,
				exit_stack: [...symbolic_stack]
			})
		}

		result.status = 'done'
		// FIXME: We should check that all mergepoints have the same stack depth
		/* Calculate number of arguments and results */
		if (is_procedure) {
			const visited_points = new Set<RegionID>()
			// FIXME: Consider all retsubs
			const return_points = exit_points.map(v => values.get(v))
			                                 .filter(v => v.kind === 'retsub')
			assert(return_points.length !== 0, "Procedures should have at least one return point")
			let current_region = return_points[0]
		}
		return result
	}

	run_from(0, false)

	for(const [region_id, region_info] of regions_info) {
		const symbolic_stack = region_info.exit_stack
		for (const successor_idx of region_successors.get(region_id)!) {
			for (const [value_hash, idx] of enumerate(symbolic_stack.slice().reverse())) {
				const phi_hash = program.length * -(idx + 1) + successor_idx
				const phi_value = values.get(phi_hash)
				if (phi_value !== undefined)
					phi_value.consumes[region_id] = value_hash
			}
		}
	}

	{
		const region_predecessors = new Map<RegionID, RegionID[]>()
		for (const [basic_block_idx, successor_idx_list] of region_successors)
			for (const successor_idx of successor_idx_list)
				get_list(region_predecessors, successor_idx).push(basic_block_idx)

		let last_loop_did_change_something = true
		while (last_loop_did_change_something) {
			last_loop_did_change_something = false
			for (const [region_id, region_info] of regions_info) {
				const predecessor_idxs = get_list(region_predecessors, region_id)
				for (const predecessor_id of predecessor_idxs) {
					const predecessor_region_info = regions_info.get(predecessor_id)!
					const values_to_be_kept = predecessor_region_info.exit_stack.slice(-region_info.pops).reverse()
					for (const [value_hash, idx] of enumerate(values_to_be_kept)) {
						const phi_hash = program.length * -(idx + 1) + region_id
						let phi_value = values.get(phi_hash)
						if (phi_value === undefined) {
							phi_value = { op: 'phi', consumes: {}, control: program.length + region_id + 1 /* Hash for the first value of the region */ }
							values.set(phi_hash, phi_value)
						}

						const index = region_info.exit_stack.length - region_info.pushes.length - (idx + 1)
						if (index < 0) {
							region_info.exit_stack.splice(0, 0, phi_hash)
							last_loop_did_change_something = true
						}

						if (phi_value.consumes[predecessor_id] === undefined) {
							phi_value.consumes[predecessor_id] = value_hash
							last_loop_did_change_something = true
						}
					}
				}
			}
		}
	}

	return values

	function resolve_label_idx(label: string, instruction_idx: InstructionID) {
		const label_idx = label === next
			? instruction_idx + 1
			: labels.get(label)
		assert(label_idx !== undefined, `Destination for label '${label}' not found!`)
		assert(label_idx < program.length, 'Program control fell out of bounds!')
		return label_idx
	}
}

const known_warnings = new Set<string>()
const warn_and_default = (instruction: ParsedInstruction) => {
	if (known_warnings.has(instruction.operation)) return [next]
	console.error(instruction.filename)
	console.error(format_instruction(instruction))
	console.error('  Had no handler registered for its successors, defaulting to fallthrough')
	known_warnings.add(instruction.operation)
	return [next]
}

const do_ssa = (filename: string) => {
	const [program, labels] = process_file(filename)
	const values = abstract_exec_program(program, labels)

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
		add_high: binop('+ low'),
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
		phi: (value_hash) => `"node${value_hash}" [label="ϕ", shape=circle]\n`,
		// CFG Operations
		start: (value_hash) => `"node${value_hash}" [label="Start", color=red]\n`,
		region: (value_hash, value) => {
			let result = `"node${value_hash}" [label="Region(${value.label})", color=red]\n`
			for (const incoming_edge of value.incoming) {
				const cfg_value = values.get(incoming_edge)
				if (cfg_value.op === 'on')
					result += `"node${cfg_value.control}" -> "node${value_hash}" [label="${cfg_value.label}", style=dashed]\n`
				else
					result += `"node${incoming_edge}" -> "node${value_hash}" [style=dashed]\n`
			}
			return result
		},
		switch: (value_hash) => `"node${value_hash}" [label="Switch", color=red]\n`,
		on: () => '',
		exit: (value_hash, value) => `"node${value_hash}" [label="${value.label}", color=red]\n`,
		sequence_point: (value_hash, value) => `"node${value_hash}" [label="${value.label || ''}", color=red]\n`,
	}
	const default_printer: AbstractOPRenderer = (value_hash, value) => `"node${value_hash}" [label=${value.op}, color=blue]`
	console.log('//', filename)
	console.log('digraph {')
	console.log('rankdir=LR')
	for (const [value_hash, value_repr] of values) {
		const ssa_op = ssa_operations[value_repr.op] || default_printer
		if (ssa_op === default_printer) console.error(`Unknown abstract operation ${value_repr.op}, using default printer`)
		console.log(ssa_op(value_hash, value_repr))
		if (value_repr.op !== 'phi' && value_repr.consumes !== undefined)
			for (const [key, consumed_value] of Object.entries(value_repr.consumes))
				console.log(`"node${consumed_value}" -> "node${value_hash}" [label="${key}"]`)
		if (value_repr.op === 'phi')
			for (const [region_id_key, mapping_value_hash] of Object.entries(value_repr.consumes)) {
				const region_id = parseInt(region_id_key)
				const region = values.get(program.length + region_id + 1)
				console.log(`"node${mapping_value_hash}" -> "node${value_hash}" [label="from ${region.label}"]\n`)
			}
		if (value_repr.op !== 'on' && value_repr.control)
			console.log(`"node${value_repr.control}" -> "node${value_hash}" [style=dashed]\n`)
	}
	console.log('}')
}

//do_ssa('randgallery/offer-algos-for-asset.teal')
//do_ssa('randgallery/offer-asset-for-algos.teal')
do_ssa('randgallery/buy-asset-for-algos.teal')

//do_ssa('tests/polynomial.teal')
//do_ssa('tests/loop.teal')
//do_ssa('tests/dig.teal')
//do_ssa('tests/cover.teal')
//do_ssa('tests/uncover.teal')
//do_ssa('tests/getbyte_setbyte.teal')

//do_ssa('stateful-teal-auction-demo/sovauc_clear.teal')
//do_ssa('stateful-teal-auction-demo/sovauc_escrow_tmpl.teal')
//do_ssa('stateful-teal-auction-demo/sovauc_approve.teal')

//do_ssa('cube/cube.teal')