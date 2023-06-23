import { Box, Tabs, TabList, Tab, TabPanels, TabPanel, Text } from '@chakra-ui/react'

const Draw = (): JSX.Element => {
  return (
    <Box width="60%" marginTop={20} marginBottom={10} textAlign='center' >
        <Tabs isFitted variant='enclosed'>
        <TabList mb='1em'>
            <Tab fontWeight='bold'>Draw</Tab>
            <Tab fontWeight='bold'>Print</Tab>
        </TabList>
        <TabPanels>
            <TabPanel>
            <Text fontSize={20}>🎨</Text>
            </TabPanel>
            <TabPanel>
            <Text fontSize={20}>🖨️</Text>
            </TabPanel>
        </TabPanels>
        </Tabs>
     </Box>
  )
}

export default Draw
