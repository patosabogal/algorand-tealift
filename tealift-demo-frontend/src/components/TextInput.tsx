import { Box, Heading, Textarea } from '@chakra-ui/react'
import { useState, useContext } from 'react'
import Context from '../context/Context'
import { type TealContextType } from '../interfaces/interfaces'
import { draw_ssa } from 'tealift'

const try_draw_ssa = (new_contents: string): string | undefined => {
  try {
    return draw_ssa(new_contents, '-', {
      blocks: true,
      phi_labels: true,
      direction: 'LR'
    })
  } catch (e) {
    console.error(e)
    return undefined
  }
}

const TextInput = (): JSX.Element => {
  const [value, setValue] = useState('')

  const { setTealContext } = useContext(Context) as TealContextType

  const handleInputChange = (e: any): void => {
    const inputValue = e.target.value
    const graph = try_draw_ssa(inputValue)
    console.log(graph)
    if (graph !== undefined) {
      const teal = {
        tealCode: inputValue,
        // FIXME: Debounce
        graph
      }
      setTealContext(teal)
    }
    setValue(inputValue)
    // console.log(inputValue)
  }

  return (
    <Box margin={4} marginTop={20} textAlign='center' width="40%">
        <Heading as='h4' size='md'>Teal Input</Heading>
        <Textarea
            marginTop={4}
            fontSize={18}
            fontWeight='semibold'
            borderRadius={16}
            value={value}
            onChange={handleInputChange}
            placeholder='#pragma version 1'
            height={400}
            size='lg'
        />
     </Box>
  )
}

export default TextInput
