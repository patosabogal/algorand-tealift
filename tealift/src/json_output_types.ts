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
export type JSONifiedProgram = {
	entrypoint: BasicBlockIndex
	basic_blocks: BasicBlock[]
}
export type BasicBlockIndex = number
export type BasicBlock = {
	incoming_edges: BasicBlockIndex[]
	outgoing_edges: BasicBlockIndex[]
    // phis[i][j] is the value for the i-th phi when coming from incoming_edges[j]
	phis: InstructionIndex[][]
	instructions: Instruction[]
	terminal: Terminal
}
export type InstructionIndex = number
export type Instruction = {
	op: OperationName
	args: OperationArguments[]
	consumes: (InstructionIndex | PhiIndex)[]
}
export type OperationName = string
export type OperationArguments = any
export type PhiIndex = number
export type Terminal = {
	op: TerminalOperationName
	args: OperationArguments[]
	consumes: (InstructionIndex | PhiIndex)[]
}
export type TerminalOperationName = string