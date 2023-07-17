import { print_ssa } from "./print_module"
import { readFileSync } from "fs"

const file = process.argv[2]
if (file === undefined) {
	console.log('Usage:', process.argv[0], process.argv[1], '<teal-file>')
	process.exit(1)
}

const contents = readFileSync(file, 'utf8')
print_ssa(contents, file)