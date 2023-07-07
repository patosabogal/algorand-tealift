/* eslint-disable react/no-children-prop */
import { Box, Code, Heading, Textarea } from '@chakra-ui/react'
import { useState, useContext } from 'react'
import Context from '../context/Context'
import { type TealContextType } from '../interfaces/interfaces'
import { draw_ssa } from 'tealift'

const TextInput = (): JSX.Element => {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string>('')
  const { setTealContext } = useContext(Context) as TealContextType

  const tryDraw = (newContents: string): string | undefined => {
    try {
      return (setError(''), draw_ssa(
        newContents, '-', {
          blocks: true,
          phi_labels: true,
          direction: 'LR'
        }))
    } catch (error) {
      if (error instanceof Error) {
        console.log(error.message)
        setError(error.message)
      } else {
        console.log('Unexpected error', error)
      }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const inputValue = e.target.value
    const graph = tryDraw(inputValue)
    // console.log(graph)
    if (graph !== undefined) {
      const teal = {
        tealCode: inputValue,
        // FIXME: Debounce
        graph,
        errorLog: error
      }
      setTealContext(teal)
      // console.log(tealContext.graph)
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
            defaultValue={value}
            onChange={(e) => { handleInputChange(e) }}
            placeholder={'#pragma version 1\n\nint 1\nreturn'}
            height={300}
            size='lg'
        />
        {
          error === ''
            ? <></>
            : <Code borderRadius={10} margin={5} colorScheme='red' maxWidth='90%' padding={1} children={error} />
        }
     </Box>
  )
}

export default TextInput
