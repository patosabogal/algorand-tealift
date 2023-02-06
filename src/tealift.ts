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
export type Label = string
export type AbstractValue = any
export type AbstractValueID = number
export type RegionID = number
export type InstructionID = number
export type DataDependencies = Record<string, AbstractValueID>
export type LabelMapping = Map<string, InstructionID>
export type ValueMap = Map<AbstractValueID, AbstractValue>
export type RegionMap = Map<AbstractValueID, RegionInfo>
export type RegionInfo = {
	name: string
	pops: number
	pushes: AbstractValueID[]
	phis: AbstractValueID[]
	values: AbstractValueID[]
	successors: RegionID[]
}

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
	/**
	 * ## **NOTE:** This is an extremely fragile API.
	 *
	 * It should only be used for consuming everything on the symbolic stack when returning from procedures
	 *
	 * Also, the current implementation is WRONG.
	 */
	readall(): DataDependencies
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
		exec(ctx, ...args) {
			const instruction_params = args
			// FIXME: Parse value
			ctx.push({ op: 'const', type: bytearray, value: instruction_params.join(' ').replace(/"/g, '\\"') })
			return ctx.resolve_label(next)
		},
	},
	// Signature: -- []byte
	'pushbytes': {
		next: () => [next],
		exec(ctx, ...args) {
			const instruction_params = args
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
	'bz': {
		next: (label) => [label, next],
		exec(ctx, label) {
			const condition = ctx.pop()
			return {
				kind: 'switch',
				consumes: { condition },
				alternatives: [ctx.resolve_label(next, 'non-zero'), ctx.resolve_label(label, 'zero')]
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
	// Signature: []byte --
	'log': {
		next: () => [next],
		exec(ctx) {
			ctx.sequence_point('log', { value: ctx.pop() })
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
	// Signature: uint64 --
	'assert': {
		next: () => [next],
		exec(ctx) {
			ctx.sequence_point('assert', { value: ctx.pop() })
			return ctx.resolve_label(next)
		}
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
	// Signature: uint64 -- any
	'txnas': {
		next: () => [next],
		exec(ctx, field: TxnaFieldName) {
			const index = ctx.pop()
			ctx.push({ op: 'ext_const', consumes: { index }, type: txna_fields[field].type || any, name: `txn.${field}[?]` })
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
		exec(ctx) {
			// FIXME: We should assert that the stack depth has to be statically known here!
			const consumes = ctx.readall()
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

function* zip<A, B>(xs: Iterable<A>, ys: Iterable<B>): Iterable<[A, B]> {
	const it = ys[Symbol.iterator]()
	for (const x of xs) {
		const { done, value: y } = it.next()
		if (done) return
		yield [x, y]
	}
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

export const get_list = <K, V>(map: Map<K, V[]>, key: K): V[] => {
	let result = map.get(key)
	if (result === undefined) {
		result = []
		map.set(key, result)
	}
	return result
}

export const process_file = (filename: string): [Program, LabelMapping] => {
	const { readFileSync } = require('fs')
	const contents = readFileSync(filename, 'utf8')
	const program = parse(filename, contents)
	const labels = gather_labels(program)
	return [program, labels]
}

const format_instruction = (ins: ParsedInstruction) =>
	`${ins.linenum.toString().padStart(4)} | ${ins.operation} ${ins.args.join(' ')}`

export const abstract_exec_program = (program: Program, labels: LabelMapping): [ValueMap, RegionMap] => {
	type FunctionID = number
	type FunctionInfo = {
		status: 'in-progress' | 'done',
		pops: number,
		pushes: number
	}

	const values = new Map<AbstractValueID, AbstractValue>()
	// First instruction of the region => ID of first sequence point
	const regions = new Map<RegionID, AbstractValueID>()
	const regions_info = new Map<RegionID, RegionInfo>()
	const functions_info = new Map<FunctionID, FunctionInfo>()

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

	const run_from = (start_instruction_id: InstructionID, is_procedure=true) => {
		const function_id = start_instruction_id
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

		type ExitPoint = {
			region_id: RegionID
			exit_point: AbstractValueID
			popped_arguments: number
			pushed_values: number
		}
		const exit_points: ExitPoint[] = []
		const instruction_queue = [{
			from_value_hash: undefined as undefined | number,
			to_instruction_idx: start_instruction_id,
			stack_height: 0,
			popped_arguments: 0
		}]

		while (instruction_queue.length !== 0) {
			const jump_destination = instruction_queue.pop()!
			const region_id = jump_destination.to_instruction_idx
			const region_name = program[region_id]!.labels[0] || format_location(program[region_id]!)
			let instruction_idx = jump_destination.to_instruction_idx
			let popped_arguments = jump_destination.popped_arguments

			const symbolic_stack: AbstractValueID[] = []
			const region_values: AbstractValueID[] = []
			const region_successors: RegionID[] = []
			let used_from_caller = 0
			let value_id = 1

			const ctx: AbstractExecutionContext = {
				push(value) {
					const value_hash = this.add_value(value)
					symbolic_stack.push(value_hash)

					return value_hash
				},
				push_handle(value_hash) {
					symbolic_stack.push(value_hash)
					return value_hash
				},
				pop() {
					if (symbolic_stack.length > 0) {
						// Return value from the stack
						return symbolic_stack.pop()!
					} else if (is_procedure) {
						// Subprocedure argument
						return this.add_value({ op: 'arg', idx: popped_arguments++ })
					}
					throw new Error('Stack underflow detected outside subprocedure\n' + format_instruction(program[instruction_idx]!))
				},
				sequence_point(label, consumes) {
					last_sequence_point = this.add_value({ op: 'sequence_point', consumes, control: last_sequence_point, label })
					return last_sequence_point
				},
				add_value(value) {
					const value_hash = program.length * value_id++ + (region_id + 1)
					values.set(value_hash, value)
					region_values.push(value_hash)
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
						consumes[`Arg(${i})`] = ctx.pop()

					last_sequence_point = this.add_value({ op: 'call', consumes, control: last_sequence_point, proc_label })

					for (const result_idx of range(pushes))
						ctx.push({ op: 'call-result', consumes: { call: last_sequence_point }, result_idx })
				},
				/**
				 * ## **NOTE:** This is an extremely fragile API.
				 *
				 * It should only be used for consuming everything on the symbolic stack when returning from procedures
				 */
				readall(): DataDependencies {
					const stack_clone = symbolic_stack.slice(0)
					const consumes: DataDependencies = {}
					for (const [value, idx] of enumerate(stack_clone.reverse())) {
						consumes[idx] = value
					}
					return consumes
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
				const incoming = new Set<RegionID>
				if (jump_destination.from_value_hash !== undefined) {
					incoming.add(jump_destination.from_value_hash)
				}

				last_sequence_point = ctx.add_value({ op: 'region', incoming, label: region_name })
				regions.set(region_id, last_sequence_point)
			}
			const region_value_hash = last_sequence_point

			for (let i = 0; i < jump_destination.stack_height; i++) {
				ctx.push({ op: 'phi', consumes: {}, control: region_value_hash })
			}
			const phis = symbolic_stack.slice()

			region_loop: while (true) {
				const instruction = program[instruction_idx]!
				const successors = isn[instruction.operation]?.exec(ctx, ...instruction.args) || fail('Unknown operation: ' + instruction.operation)

				switch (successors.kind) {
				case 'exit':
					last_sequence_point = ctx.add_value({ op: 'exit', control: last_sequence_point, label: successors.label, consumes: successors.consumes })
					exit_points.push({ region_id, exit_point: last_sequence_point, popped_arguments, pushed_values: symbolic_stack.length })
					break region_loop
				case 'switch':
					last_sequence_point = ctx.add_value({ op: 'switch', control: last_sequence_point, consumes: successors.consumes })

					for (const alternative of successors.alternatives) {
						const projection_hash = ctx.add_value({ op: 'on', control: last_sequence_point, label: alternative.label })
						instruction_queue.push({
							from_value_hash: projection_hash,
							to_instruction_idx: alternative.instruction_idx,
							stack_height: symbolic_stack.length,
							popped_arguments
						})
					}
					region_successors.push(...successors.alternatives.map(v => v.instruction_idx))
					break region_loop
				case 'jump':
					instruction_idx = successors.instruction_idx

					if (predecessors_of(instruction_idx).length > 1) {
						instruction_queue.push({
							from_value_hash: last_sequence_point,
							to_instruction_idx: instruction_idx,
							stack_height: symbolic_stack.length,
							popped_arguments
						})
						region_successors.push(instruction_idx)
						break region_loop
					}
					break
				default:
					throw new Error('Unknown CFG operation ' + (successors as any).kind)
				}
			}

			regions_info.set(region_id, {
				name: region_name,
				pops: used_from_caller,
				pushes: symbolic_stack,
				phis,
				values: region_values,
				successors: region_successors
			})
		}

		result.status = 'done'
		/* Calculate number of arguments and results */
		const return_points = exit_points.filter(v => values.get(v.exit_point)?.label === 'retsub')
		const procedure_first_instruction = program[start_instruction_id]!
		const procedure_name = procedure_first_instruction.labels[0] || `procedure at ${procedure_first_instruction.filename}:${procedure_first_instruction.linenum}`
		result.pops = Math.max(...exit_points.map(v => v.popped_arguments))

		const pushes = return_points.map(v => v.pushed_values)
		if (pushes.length > 0) {
			assert(pushes.every(v => v === pushes[0]), `Procedure "${procedure_name}" does not always return the same number of values`)
			result.pushes = pushes[0]!
		} else if (is_procedure) {
			console.warn(`No return points found for procedure "${procedure_name}"`)
		}
		return result
	}

	run_from(0, false)

	for(const [region_id, region_info] of regions_info) {
		const symbolic_stack = region_info.pushes
		for (const successor_idx of regions_info.get(region_id)!.successors) {
			const phis_hashes = regions_info.get(successor_idx)!.phis
			if (phis_hashes.length === 0) {
				// Nothing to do here
				continue
			}
			const value_hashes = symbolic_stack.slice(-phis_hashes.length)
			if (phis_hashes.length !== value_hashes.length) {
				console.error(symbolic_stack)
				console.error(phis_hashes)
			}
			assert(phis_hashes.length === value_hashes.length, "Not enough values on symbolic stack")

			for (const [phi_hash, value_hash] of zip(phis_hashes, value_hashes)) {
				const phi_value = values.get(phi_hash)
				assert(phi_value !== undefined, "ICE: Invalid value hash on phi list")
				phi_value.consumes[region_id] = value_hash
			}
		}
	}

	/* Assert mergepoint stack height invariant */ {
		const region_predecessors = new Map<RegionID, RegionID[]>()
		for (const [predecessor, {successors}] of regions_info) {
			for (const successor of successors) {
				get_list(region_predecessors, successor).push(predecessor)
			}
		}

		let everything_ok = true

		for (const [successor, predecessors] of region_predecessors) {
			const stack_heights = predecessors.map(v => regions_info.get(v)!.pushes.length)
			const is_ok = stack_heights.every(v => v === stack_heights[0])
			everything_ok &&= is_ok
			if (!is_ok) {
				const region_name = regions_info.get(successor)!.name
				console.error(`Region "${region_name}" can be reached with multiple different stack heights:`)
				for (const predecessor of predecessors) {
					const predecessor_info = regions_info.get(predecessor)!
					console.error(` - From region "${predecessor_info.name}" stack has height ${predecessor_info.pushes.length}`)
				}
			}
		}

		assert(everything_ok, "Mergepoints from multiple basic blocks should always have the same stack height")
	}
	return [values, regions_info]

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
