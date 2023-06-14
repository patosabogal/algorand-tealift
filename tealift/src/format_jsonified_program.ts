import type { BasicBlockIndex, InstructionIndex, JSONifiedProgram } from "./json_output_types"
import { enumerate } from "./utils"

function format_idx(bb_idx: BasicBlockIndex, instruction_idx: InstructionIndex): string {
    if (instruction_idx < 0) {
        return `%${bb_idx}_phi_${~instruction_idx}`
    }
    return `%${bb_idx}_${instruction_idx}`
}

function format_basic_block(program: JSONifiedProgram, bb_idx: BasicBlockIndex): string {
	const bb = program.basic_blocks[bb_idx]!
    let result = `#${bb_idx}:\n`
	for (const [phi, phi_idx] of enumerate(bb.phis)) {
		let line = `  ${format_idx(bb_idx, ~phi_idx)} = phi`
		for (const [option, idx] of enumerate(phi)) {
			const predecessor_bb_idx = bb.incoming_edges[idx]!
			line += ` on_${predecessor_bb_idx}=${format_idx(predecessor_bb_idx, option)}`
		}
        result += `${line}\n`
	}
	for (const [instruction, idx] of enumerate(bb.instructions)) {
		let line = instruction.op !== 'sequence_point'
		  ? `  ${format_idx(bb_idx, idx)} = ${instruction.op}`
		  : '  sequence_point'
		for (const arg of instruction.args) {
			line += ` ${arg}`
		}
		for (const consumed of instruction.consumes) {
			line += ` ${format_idx(bb_idx, consumed)}`
		}
        result += `${line}\n`
	}
	/* Terminal */ {
		let line = `  ${bb.terminal.op}`
		for (const arg of bb.terminal.args) {
			line += ` ${arg}`
		}
		for (const consumed of bb.terminal.consumes) {
			line += ` ${format_idx(bb_idx, consumed)}`
		}
		for (const destination of bb.outgoing_edges) {
			line += ` #${destination}`
		}
        result += `${line}\n`
	}
    return result
}

export function format_jsonified_program(program: JSONifiedProgram): string {
    let result = `entrypoint #${program.entrypoint}\n`
	for (let i = 0; i < program.basic_blocks.length; i++) {
		result += format_basic_block(program, i)
	}
    return result
}


if (require.main === module) {
    const file = process.argv[2]
    if (file === undefined) {
        console.log('Usage:', process.argv[0], process.argv[1], '<jsonified-program>')
        process.exit(1)
    }


    const { readFileSync } = require('fs')
    const program = JSON.parse(readFileSync(file, 'utf8'))
    console.log(format_jsonified_program(program))
}