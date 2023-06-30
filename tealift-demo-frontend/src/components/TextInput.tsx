import { Box, Heading, Textarea } from '@chakra-ui/react'
import { useState, useContext } from 'react'
import Context from '../context/Context'
import { type TealContextType } from '../interfaces/interfaces'

const TextInput = (): JSX.Element => {
  const [value, setValue] = useState('')

  const { setTealContext } = useContext(Context) as TealContextType

  const handleInputChange = (e: any): void => {
    const inputValue = e.target.value
    const teal = {
      tealCode: inputValue,
      graph: ''
    }
    setTealContext(teal)
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
