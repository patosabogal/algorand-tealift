import { readFileSync } from "fs"
import { build_jsonified_program } from "./print_module"

if (require.main === module) {
	const file = process.argv[2]
	if (file === undefined) {
		console.log('Usage:', process.argv[0], process.argv[1], '<teal-file>')
		process.exit(1)
	}

	const contents = readFileSync(file, 'utf8')
	const program = build_jsonified_program(contents, file)
	console.log(JSON.stringify(program, null, 2))
}
