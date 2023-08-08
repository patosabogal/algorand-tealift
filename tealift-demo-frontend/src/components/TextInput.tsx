/* eslint-disable react/no-children-prop */
import { Box, Code, Heading, Textarea } from '@chakra-ui/react'
import { useState, useContext, useEffect } from 'react'
import Context from '../context/Context'
import { draw_ssa } from 'tealift'

const PLACEHOLDER_PROGRAM = '#pragma version 1\n\nint 1\nreturn'

const TextInput = (): JSX.Element => {
  const [value, setValue] = useState(PLACEHOLDER_PROGRAM)
  const [error, setError] = useState('')
  const { setTealContext } = useContext(Context)

  const tryDraw = (newContents: string): string | undefined => {
    setError('')
    try {
      return draw_ssa(
        newContents,
        '-',
        {
          blocks: true,
          phi_labels: true,
          direction: 'LR'
        }
      )
    } catch (error) {
      console.error(error)
      const message = error instanceof Error
        ? error.message
        : String(error)
      setError(message)
    }
  }

  const handleInputChange = (inputValue: string): void => {
    const graph = tryDraw(inputValue)
    if (graph !== undefined) {
      const teal = {
        tealCode: inputValue,
        // FIXME: Debounce
        graph,
        errorLog: error
      }
      setTealContext(teal)
    }
  }

  // Initialization
  useEffect(() => {
    handleInputChange(value)
  }, [value])

  return (
    <Box margin={4} marginTop={20} textAlign='center' width="40%">
        <Heading as='h4' size='md'>Teal Input</Heading>
        <Textarea
            marginTop={4}
            fontSize={18}
            fontWeight='semibold'
            borderRadius={16}
            value={value}
            onChange={(e) => { setValue(e.target.value) }}
            placeholder={PLACEHOLDER_PROGRAM}
            height={400}
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
