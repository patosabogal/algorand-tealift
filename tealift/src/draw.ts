import { draw_ssa } from './draw_module'
import { readFileSync } from 'fs'

const file = process.argv[2]
if (file === undefined) {
	console.log('Usage:', process.argv[0], process.argv[1], '<teal-file>', '[--no-blocks]', '[--no-phi-labels]', '[--dir=TD|LR]')
	process.exit(1)
}

const blocks = process.argv.slice(3).every(v => v !== '--no-blocks')
const phi_labels = process.argv.slice(3).every(v => v !== '--no-phi-labels')
const direction = (process.argv.slice(3).find(v => v === '--dir=TD' || v === '--dir=LR')?.slice('--dir='.length) || 'TD') as 'TD' | 'LR'

const contents = readFileSync(file, 'utf8')
draw_ssa(contents, file, { blocks, phi_labels, direction })
