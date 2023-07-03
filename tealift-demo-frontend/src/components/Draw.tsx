import { Box, Tabs, TabList, Tab, TabPanels, TabPanel, Text } from '@chakra-ui/react'
import { Graphviz } from '@hpcc-js/wasm/graphviz'
import { useEffect, useContext, useState } from 'react'
import Context from '../context/Context'
import { type TealContextType } from '../interfaces/interfaces'

const Draw = (): JSX.Element => {
  const { tealContext } = useContext(Context) as TealContextType
  const [graphURL, setGraphURL] = useState<string>('/vite.svg')
  const graphviz_load = Graphviz.load()

  useEffect(() => {
    void draw()
  }, [tealContext])

  async function draw (): Promise<void> {
    const graphviz = await graphviz_load
    const svgString = graphviz.layout(tealContext.graph, 'svg', 'dot')
    // FIXME: Release URL
    const svgBlob = new Blob([svgString], { type: "image/svg+xml" })
    const blobURL = URL.createObjectURL(svgBlob)
    setGraphURL(blobURL)
  }

  return (
    <Box width="60%" marginTop={20} marginBottom={10} textAlign='center' >
        <Tabs isFitted variant='enclosed'>
        <TabList mb='1em'>
            <Tab fontWeight='bold'>Draw</Tab>
            <Tab fontWeight='bold'>Print</Tab>
        </TabList>
        <TabPanels>
            <TabPanel marginLeft='25%'>
            <Text fontSize={20}>
              <a href={graphURL} download="tealift-graph.svg">
                <img src={graphURL}/>
              </a>
            </Text>
            </TabPanel>
            <TabPanel>
              <Text fontSize={20}>{tealContext.tealCode}</Text>
            </TabPanel>
        </TabPanels>
        </Tabs>
     </Box>
  )
}

export default Draw
