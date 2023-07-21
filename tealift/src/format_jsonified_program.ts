import { format_jsonified_program } from "./print_module"

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