import assert, { fail } from './assert'
import asset_holding_fields from './asset_holding_fields'
import block_fields from './block_fields'
import global_fields from './global_fields'
import txn_fields from './txn_fields'
import txna_fields from './txna_fields'
import { get_list, range, enumerate, zip } from './utils'

type AssetHoldingFieldName = keyof typeof asset_holding_fields
type BlockFieldName = keyof typeof block_fields
type GlobalFieldName = keyof typeof global_fields
type TxnFieldName = keyof typeof txn_fields
type TxnaFieldName = keyof typeof txna_fields

const uint64 = 'uint64'
const bytearray = '[]byte'
const any = 'any'
const next = ':next'

type HashAlgorithmName = 'sha256' | 'keccak256' | 'sha512_256'
type BinopName = 'add' | 'sub' | 'div' | 'mul' | 'lt' | 'gt' | 'le' | 'ge'
	| 'and' | 'or' | 'eq' | 'ne' | 'mod' | 'bitor' | 'bitand' | 'bitxor'
	| 'bitnot' | 'bitand' | 'concat'
	| 'getbyte'
type Consumes<T extends string> = { consumes: Record<T, AbstractValueID> }
type TypeName = 'uint64' | '[]byte' | 'any'
type ConstOriginName = string // FIXME: Use stronger types

export type OpName = AbstractValue["op"]
export type AbstractValue =
	| ControlFlowOP
	| SequencePointOP & { control: AbstractValueID }
	| { op: 'add_high' } & Consumes<'rhs' | 'lhs'>
	| { op: 'add_low' } & Consumes<'rhs' | 'lhs'>
	| { op: 'arg', idx: number }
	| { op: 'cast', type: TypeName } & Consumes<'value'>
	| { op: 'const', type: TypeName, value: any }
	| { op: 'ed25519verify' } & Consumes<'pubkey' | 'signature' | 'data'>
	| { op: 'ext_const', type: TypeName, origin: ConstOriginName, name: string }
	| { op: 'ext_const_array', type: TypeName, origin: ConstOriginName, name: string } & Consumes<'index'>
	| { op: 'ext_const_array_array', type: TypeName, origin: ConstOriginName, name: string } & Consumes<'index' | 'index2'>
	| { op: 'has_external_global', control: AbstractValueID } & Consumes<"key" | "appid">
	| { op: 'has_external_local', control: AbstractValueID } & Consumes<"key" | "appid" | "account">
	| { op: 'hash', algo: HashAlgorithmName } & Consumes<'value'>
	| { op: 'len' } & Consumes<'value'>
	| { op: 'load_external_global', control: AbstractValueID } & Consumes<"key" | "appid">
	| { op: 'load_external_local', control: AbstractValueID } & Consumes<"key" | "appid" | "account">
	| { op: 'load_global', control: AbstractValueID } & Consumes<"key">
	| { op: 'load_local', control: AbstractValueID } & Consumes<"key" | "account">
	| { op: 'load_scratch', key: string, control: AbstractValueID }
	| { op: 'load_scratch_dynamic', control: AbstractValueID } & Consumes<"key">
	| { op: 'mul_high' } & Consumes<'rhs' | 'lhs'>
	| { op: 'mul_low' } & Consumes<'rhs' | 'lhs'>
	| { op: 'not' } & Consumes<'value'>
	| { op: 'replace' } & Consumes<'value' | 'index' | 'replacement'>
	| { op: 'select' } & Consumes<'condition' | 'on_zero' | 'on_nonzero'>
	| { op: 'setbyte' } & Consumes<'bytes' | 'index' | 'value'>
	| { op: 'substring' } & Consumes<'word' | 'start' | 'end'>
	| { op: BinopName, variant: InstructionVariant } & Consumes<'rhs' | 'lhs'>
type SequencePointOP =
	| { op: 'assert' } & Consumes<'value'>
	| { op: 'delete_global' } & Consumes<"key">
	| { op: 'delete_local' } & Consumes<"key" | "account">
	| { op: 'log' } & Consumes<'value'>
	| { op: 'store_global' } & Consumes<"key" | "value">
	| { op: 'store_local' } & Consumes<"key" | "value" | "account">
	| { op: 'store_scratch', key: string } & Consumes<"value">
	| { op: 'store_scratch_dynamic' } & Consumes<"key" | "value">
type ControlFlowOP =
	| { op: 'call', control: AbstractValueID, proc_label: string } & Consumes<string>
	| { op: 'call-result', result_idx: number } & Consumes<"call">
	| { op: 'exit', label: string, control: AbstractValueID } & Consumes<string>
	| { op: 'on', control: AbstractValueID, label: string }
	| { op: 'phi', control: AbstractValueID } & Consumes<string>
	| { op: 'region', incoming: Set<RegionID>, label: string }
	| { op: 'switch-on-zero', control: AbstractValueID, consumes: Record<string, AbstractValueID> }
// FIXME: Use stronger types
export type Label = string
export type AbstractValueID = number
export type RegionID = number
export type InstructionID = number
export type DataDependencies = Record<string, AbstractValueID>
export type LabelMapping = Map<string, InstructionID>
export type ValueMap = Map<AbstractValueID, AbstractValue>
export type RegionMap = Map<RegionID, RegionInfo>
export type RegionInfo = {
	name: string
	pops: number
	pushes: AbstractValueID[]
	phis: AbstractValueID[]
	values: AbstractValueID[]
	successors: RegionID[]
}

type AVMVersion = 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7' | 'v8'

interface InstructionDescription {
	availability?: AVMVersion
	next(...args: any): Label[]
	exec(ctx: AbstractExecutionContext, ...args: any): NextStepDescription
}

interface AbstractExecutionContext {
	push(value: AbstractValue): AbstractValueID
	push_handle(value_hash: AbstractValueID): AbstractValueID
	pop(): AbstractValueID
	sequence_point(op: SequencePointOP): AbstractValueID
	// NOTE: Should only be used sparingly
	get_value(value: AbstractValueID): AbstractValue
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
type SwitchDescription = { kind: 'switch-on-zero', consumes: DataDependencies, alternatives: JumpDescription[] }

type NextStepDescription = JumpDescription | ExitDescription | SwitchDescription

type InstructionVariant = 'uint64' | '[]byte' | 'none'

function binop(abstract_op: BinopName, variant='none' as InstructionVariant, availability?: AVMVersion): InstructionDescription {
	if (availability !== undefined) {
		return {
			availability,
			next: () => [next],
			exec(ctx) {
				const rhs = ctx.pop()
				const lhs = ctx.pop()
				ctx.push({ op: abstract_op, consumes: { rhs, lhs }, variant })
				return ctx.resolve_label(next)
			},
		}
	}

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

function v1_binop(abstract_op: BinopName, variant: InstructionVariant='none'): InstructionDescription {
	return binop(abstract_op, variant, 'v1')
}

function v1_hash(algo: HashAlgorithmName): InstructionDescription {
	return {
		availability: 'v1',
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			ctx.push({ op: 'hash', algo, consumes: { value } })
			return ctx.resolve_label(next)
		}
	}
}

// FIXME: Better type here
const isn: Record<string, InstructionDescription> = {
	// Signature: --
	'err': {
		availability: 'v1',
		next: () => [],
		exec() {
			return {
				kind: 'exit',
				label: 'err',
				consumes: {}
			}
		},
	},
	// Signature: []byte -- []byte
	'sha256': v1_hash('sha256'),
	'keccak256': v1_hash('keccak256'),
	'sha512_256': v1_hash('sha512_256'),
	// Signature: []byte []byte []byte -- uint64
	'ed25519verify': {
		availability: 'v1',
		next: () => [next],
		exec(ctx) {
			const pubkey = ctx.pop()
			const signature = ctx.pop()
			const data = ctx.pop()
			// FIXME: Should we use the same op for all verify operations?
			ctx.push({ op: 'ed25519verify', consumes: { pubkey, signature, data } })
			return ctx.resolve_label(next)
		}
	},
	// Signature: uint64 uint64 -- uint64
	'+': v1_binop('add', uint64),
	'-': v1_binop('sub', uint64),
	'/': v1_binop('div', uint64),
	'*': v1_binop('mul', uint64),
	'<': v1_binop('lt', uint64),
	'>': v1_binop('gt', uint64),
	'>=': v1_binop('gt', uint64),
	'<=': v1_binop('gt', uint64),
	'&&': v1_binop('and', uint64),
	'||': v1_binop('or', uint64),
	// Signature: any any -- uint64
	'==': v1_binop('eq'),
	'!=': v1_binop('ne'),
	// Signature: uint64 -- uint64
	'!': {
		availability: 'v1',
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			ctx.push({ op: 'not', consumes: { value } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: []byte -- uint64
	'len': {
		availability: 'v1',
		next: () => [next],
		exec(ctx) {
			ctx.push({ op: 'len', consumes: { value: ctx.pop() } })
			return ctx.resolve_label(next)
		}
	},
	// Signature: uint64 -- []byte
	'itob': {
		availability: 'v1',
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			ctx.push({ op: 'cast', type: bytearray, consumes: { value } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: []byte -- uint64
	'btoi': {
		availability: 'v1',
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			ctx.push({ op: 'cast', type: uint64, consumes: { value } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 uint64 -- uint64
	'%': binop('mod'),
	'|': binop('bitor', uint64),
	'&': binop('bitand', uint64),
	'^': binop('bitxor', uint64),
	'~': binop('bitnot', uint64),
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
		availability: 'v1',
		next: () => [next],
		exec(ctx) {
			const rhs = ctx.pop()
			const lhs = ctx.pop()
			ctx.push({ op: 'mul_high', consumes: { rhs, lhs } })
			ctx.push({ op: 'mul_low',  consumes: { rhs, lhs } })
			return ctx.resolve_label(next)
		},
	},
	// -- []byte
	'arg': {
		availability: 'v1',
		next: () => [next],
		exec(ctx, n) {
			const index = ctx.add_value({ op: 'const', type: uint64, value: parseInt(n) || n })
			ctx.push({ op: 'ext_const_array', type: bytearray, origin: 'Arg', name: `args`, consumes: { index } })
			return ctx.resolve_label(next)
		}
	},
	'arg_0': {
		availability: 'v1',
		next: () => [next],
		exec: (ctx) => isn['arg']!.exec(ctx, 0)
	},
	'arg_1': {
		availability: 'v1',
		next: () => [next],
		exec: (ctx) => isn['arg']!.exec(ctx, 1)
	},
	'arg_2': {
		availability: 'v1',
		next: () => [next],
		exec: (ctx) => isn['arg']!.exec(ctx, 2)
	},
	'arg_3': {
		availability: 'v1',
		next: () => [next],
		exec: (ctx) => isn['arg']!.exec(ctx, 3)
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
		availability: 'v1',
		next: (label) => [label, next],
		exec(ctx, label) {
			const condition = ctx.pop()
			// Try to detect if this `bnz` is just a regular old `b`
			//
			// v2 added both `b` and `bz` so this kind of code should only appear on `bnz`
			// for really old contracts.
			const condition_value = ctx.get_value(condition);
			if (condition_value.op === 'const' && condition_value.type === uint64) {
				return condition_value.value === 0
					? ctx.resolve_label(next)
					: ctx.resolve_label(label)
			}
			return {
				kind: 'switch-on-zero',
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
				kind: 'switch-on-zero',
				consumes: { condition },
				alternatives: [ctx.resolve_label(label, 'zero'), ctx.resolve_label(next, 'non-zero')]
			}
		},
	},
	// Signature: any -- any any
	'dup': {
		availability: 'v1',
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
	// Signature: []byte []byte -- []byte
	// Signature: []byte uint64 []byte -- []byte
	'replace': {
		next: () => [next],
		exec(ctx, maybeIndex) {
			if (maybeIndex) {
				return isn['replace2']!.exec(ctx, maybeIndex)
			} else {
				return isn['replace3']!.exec(ctx)
			}
		}
	},
	// Signature: []byte uint64 []byte -- []byte
	'replace2': {
		next: () => [next],
		exec(ctx, indexArgument) {
			const replacement = ctx.pop()
			const index = ctx.add_value({ op: 'const', type: uint64, value: parseInt(indexArgument) || indexArgument })
			const value = ctx.pop()
			ctx.push({ op: 'replace', consumes: { value, index, replacement } })
			return ctx.resolve_label(next)
		}
	},
	// Signature: []byte uint64 []byte -- []byte
	'replace3': {
		next: () => [next],
		exec(ctx) {
			const replacement = ctx.pop()
			const index = ctx.pop()
			const value = ctx.pop()
			ctx.push({ op: 'replace', consumes: { value, index, replacement } })
			return ctx.resolve_label(next)
		}
	},
	// Signature: any --
	'pop': {
		availability: 'v1',
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
			ctx.sequence_point({ op: 'log', consumes: { value: ctx.pop() } })
			return ctx.resolve_label(next)
		}
	},
	// Signature: uint64 --
	'assert': {
		next: () => [next],
		exec(ctx) {
			ctx.sequence_point({ op: 'assert', consumes: { value: ctx.pop() } })
			return ctx.resolve_label(next)
		}
	},
	// Signature: any1, any2, ... anyN --
	'popn': {
		availability: 'v8',
		next: () => [next],
		exec(ctx, count) {
			count = parseInt(count)
			for (let i = 0; i < count; i++)
				ctx.pop()
			return ctx.resolve_label(next)
		}
	},
	// Signature: uint64 -- any
	'block': {
		availability: 'v7',
		next: () => [next],
		exec(ctx, field: BlockFieldName) {
			const index = ctx.pop()
			const { name, type } = block_fields[field]
			ctx.push({ op: 'ext_const_array', type, origin: 'Block', name, consumes: { index } })
			return ctx.resolve_label(next)
		}
	},
	// Signature: any any uint64 -- any
	'select': {
		availability: 'v3',
		next: () => [next],
		exec(ctx) {
			const C = ctx.pop()
			const B = ctx.pop()
			const A = ctx.pop()
			ctx.push({ op: 'select', consumes: { condition: C, on_zero: A, on_nonzero: B } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: byte[] uint64 uint64 -- byte[]
	'substring3': {
		availability: 'v2',
		next: () => [next],
		exec(ctx) {
			const end = ctx.pop()
			const start = ctx.pop()
			const word = ctx.pop()
			ctx.push({ op: 'substring', consumes: { word, start, end } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: byte[] -- byte[]
	'substring': {
		availability: 'v2',
		next: () => [next],
		exec(ctx, start, end) {
			end = ctx.add_value({ op: 'const', type: uint64, value: parseInt(end) || end })
			start = ctx.add_value({ op: 'const', type: uint64, value: parseInt(start) || start })
			const word = ctx.pop()
			ctx.push({ op: 'substring', consumes: { word, start, end } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 -- any
	'loads': {
		availability: 'v5',
		next: () => [next],
		exec(ctx) {
			const key = ctx.pop()
			ctx.push({ op: 'load_scratch_dynamic', consumes: { key }, control: ctx.last_sequence_point })
			return ctx.resolve_label(next)
		}
	},
	// Signature: uint64 any --
	'stores': {
		availability: 'v5',
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			const key = ctx.pop()
			ctx.sequence_point({ op: 'store_scratch_dynamic', consumes: { key, value } })
			return ctx.resolve_label(next)
		}
	},
	// Signature: -- any
	'global': {
		availability: 'v1',
		next: () => [next],
		exec(ctx, name: GlobalFieldName) {
			ctx.push({ op: 'ext_const', type: global_fields[name].type || any, origin: 'Global', name })
			return ctx.resolve_label(next)
		},
	},
	// Signature: -- any
	'gtxn': {
		availability: 'v1',
		next: () => [next],
		exec(ctx, txn, name: TxnFieldName) {
			const index = ctx.add_value({ op: 'const', type: uint64, value: parseInt(txn) || txn })
			ctx.push({ op: 'ext_const_array', type: txn_fields[name].type || any, origin: 'Gtxn', name, consumes: { index } })
			return ctx.resolve_label(next)
		},
	},
	'gtxna': {
		availability: 'v1',
		next: () => [next],
		exec(ctx, txn, name: TxnaFieldName, idx) {
			const index = ctx.add_value({ op: 'const', type: uint64, value: parseInt(txn) || txn })
			const index2 = ctx.add_value({ op: 'const', type: uint64, value: parseInt(idx) || idx })
			ctx.push({ op: 'ext_const_array_array', type: txna_fields[name].type || any, origin: 'Gtxna', name, consumes: { index, index2} })
			return ctx.resolve_label(next)
		},
	},
	// Signature: -- any
	'txn': {
		availability: 'v1',
		next: () => [next],
		exec(ctx, name: TxnFieldName) {
			ctx.push({ op: 'ext_const', type: txn_fields[name].type || any, origin: 'Txn', name })
			return ctx.resolve_label(next)
		},
	},
	// Signature: -- any
	'txna': {
		next: () => [next],
		exec(ctx, name: TxnaFieldName, idx) {
			const index = ctx.add_value({ op: 'const', type: uint64, value: parseInt(idx) || idx })
			ctx.push({ op: 'ext_const_array', type: txna_fields[name].type || any, origin: 'Txn', name, consumes: { index }})
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 -- any
	'txnas': {
		next: () => [next],
		exec(ctx, name: TxnaFieldName) {
			const index = ctx.pop()
			ctx.push({ op: 'ext_const_array', type: txna_fields[name].type || any, origin: 'Txn', name, consumes: { index }})
			return ctx.resolve_label(next)
		},
	},
	// Signature: []byte uint64 -- any
	'asset_holding_get': {
		next: (_field) => [next],
		exec(ctx, name: AssetHoldingFieldName) {
			const asset = ctx.pop()
			const account = ctx.pop()
			ctx.push({ op: 'ext_const_array_array', type: asset_holding_fields[name].type || any, origin: 'Asset', name, consumes: { index: asset, index2: account } })
			ctx.push({ op: 'ext_const_array_array', type: uint64 || any, origin: 'Asset', name: 'opted_in', consumes: { index: asset, index2: account } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 uint64 -- any
	'app_opted_in': {
		next: (_field) => [next],
		exec(ctx) {
			const application = ctx.pop()
			const account = ctx.pop()
			ctx.push({ op: 'ext_const_array_array', type: uint64 || any, origin: 'Application', name: 'opted_in', consumes: { index: application, index2: account } })
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
			ctx.push({ op: 'load_global', consumes: { key }, control: ctx.last_sequence_point })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 byte[] -- any
	'app_local_get': {
		next: () => [next],
		exec(ctx) {
			const key = ctx.pop()
			const account = ctx.pop()
			ctx.push({ op: 'load_local', consumes: { key, account }, control: ctx.last_sequence_point })
			return ctx.resolve_label(next)
		},
	},
	// Signature: byte[] any --
	'app_global_put': {
		next: () => [next],
		exec(ctx) {
			const value = ctx.pop()
			const key = ctx.pop()
			ctx.sequence_point({ op: 'store_global', consumes: { key, value } })
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
			ctx.sequence_point({ op: 'store_local', consumes: { key, value, account } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: byte[] --
	'app_global_del': {
		next: () => [next],
		exec(ctx) {
			const key = ctx.pop()
			ctx.sequence_point({ op: 'delete_global', consumes: { key } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 byte[] --
	'app_local_del': {
		next: () => [next],
		exec(ctx) {
			const key = ctx.pop()
			const account = ctx.pop()
			ctx.sequence_point({ op: 'delete_local', consumes: { key, account } })
			return ctx.resolve_label(next)
		},
	},
	// Signature: uint64 uint64 byte[] -- any uint64
	'app_local_get_ex': {
		next: () => [next],
		exec(ctx) {
			const key = ctx.pop()
			const appid = ctx.pop()
			const account = ctx.pop()
			// FIXME: If we know that the appid is not the current app we can improve the representation
			ctx.push({ op: 'load_external_local', consumes: { key, appid, account }, control: ctx.last_sequence_point })
			ctx.push({ op: 'has_external_local', consumes: { key, appid, account }, control: ctx.last_sequence_point })
			return ctx.resolve_label(next)
		}
	},
	// Signature: uint64 byte[] -- any uint64
	'app_global_get_ex': {
		next: () => [next],
		exec(ctx) {
			const key = ctx.pop()
			const appid = ctx.pop()
			// FIXME: If we know that the appid is not the current app we can optimize the representation
			ctx. push({ op: 'load_external_global', consumes: { key, appid }, control: ctx.last_sequence_point })
			ctx. push({ op: 'has_external_global', consumes: { key, appid }, control: ctx.last_sequence_point })
			return ctx.resolve_label(next)
		}
	},
	// Signature: -- any
	'load': {
		availability: 'v1',
		next: () => [next],
		exec(ctx, key) {
			// FIXME: We should SSA these
			ctx.push({ op: 'load_scratch', key, control: ctx.last_sequence_point })
			return ctx.resolve_label(next)
		},
	},
	// Signature: any --
	'store': {
		availability: 'v1',
		next: () => [next],
		exec(ctx, key) {
			// FIXME: We should SSA these
			const value = ctx.pop()
			ctx.sequence_point({ op: 'store_scratch', key, consumes: { value } })
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

export const process_contents = (contents: string, filename: string): [Program, LabelMapping] => {
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
				sequence_point(op) {
					last_sequence_point = this.add_value({ ...op, control: last_sequence_point })
					return last_sequence_point
				},
				get_value(value_hash) {
					const value = values.get(value_hash)
					if (value === undefined)
						throw new Error('No value was registered for id ' + value_hash)
					return value
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
					const region_value = values.get(region)
					assert(region_value !== undefined && region_value.op == 'region', "Internal error, unable to find value for region_id=" + region_id)
					assert(jump_destination.from_value_hash !== undefined, "Internal error: Expected jump destination to be defined")
					region_value.incoming.add(jump_destination.from_value_hash)
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
				case 'switch-on-zero':
					last_sequence_point = ctx.add_value({ op: 'switch-on-zero', control: last_sequence_point, consumes: successors.consumes })

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
		const return_points = exit_points.filter(v => {
			const value = values.get(v.exit_point)
			assert(value !== undefined && value.op === 'exit', "Internal error: Exit point does not have the correct operation")
			return value.label === 'retsub'
		})
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
				assert(phi_value !== undefined && phi_value.op === 'phi', "ICE: Invalid value hash on phi list")
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
