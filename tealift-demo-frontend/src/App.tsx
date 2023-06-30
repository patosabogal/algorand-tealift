import { Box, Text, Heading, Stack } from '@chakra-ui/react'
import TextInput from './components/TextInput'
import Footer from './components/Footer'
import Draw from './components/Draw'
import { TealContextProvider } from './context/Context'

const App = (): JSX.Element => {
  return (
    <TealContextProvider>
      <Box>
        <Box margin={4} textAlign='center'>
          <Heading>Tealift 🚀</Heading>
            <Text fontSize='xl'>
              Translate your code
            </Text>
            <Stack direction='row' justifyContent='center' spacing='10%'>
              <TextInput/>
              <Draw />
            </Stack>
        </Box>
        <Footer />
      </Box>
    </TealContextProvider>
  )
}

export default App
