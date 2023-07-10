/* eslint-disable react/no-children-prop */
import {
  Box, Tabs, TabList, Tab, TabPanels,
  TabPanel, Text, Code, Button
} from '@chakra-ui/react'
import { Graphviz } from '@hpcc-js/wasm/graphviz'
import { useEffect, useContext, useState } from 'react'
import Context from '../context/Context'
import { type TealContextType } from '../interfaces/interfaces'
import defaultImage from '../assets/tealift.svg'

const Draw = (): JSX.Element => {
  const { tealContext } = useContext(Context) as TealContextType
  const [graphURL, setGraphURL] = useState<string>(defaultImage)
  const graphvizLoad = Graphviz.load()

  useEffect(() => {
    void draw()
  }, [tealContext])

  async function draw (): Promise<void> {
    if (tealContext.graph === '') {
      setGraphURL(defaultImage)
      return
    }
    const graphviz = await graphvizLoad
    const svgString = graphviz.layout(tealContext.graph, 'svg', 'dot')
    // FIXME: Release URL
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' })
    const blobURL = URL.createObjectURL(svgBlob)
    setGraphURL(blobURL)
  }

  return (
    <Box width="60%" marginTop={20} marginBottom={10} textAlign='center' >
        <Tabs isFitted variant='enclosed'>
        <TabList mb='1em'>
            <Tab fontWeight='bold'>Draw</Tab>
            <Tab fontWeight='bold'>Graph Code</Tab>
        </TabList>
        <TabPanels>
            <TabPanel>
            <Text fontSize={20}>
                <img src={graphURL}/>
                <Button marginLeft='auto' marginRight='auto' marginTop={5} colorScheme='blue' variant='outline'>
                  <a href={graphURL} download="tealift-graph.svg">
                    Download graph
                  </a>
                </Button>
            </Text>
            </TabPanel>
            <TabPanel>
              {
                tealContext.graph === ''
                  ? <Text fontSize={20}>No graph to print</Text>
                  : <Code borderRadius={10} maxWidth='70%' padding={5} children={tealContext.graph} />
              }
            </TabPanel>
        </TabPanels>
        </Tabs>
     </Box>
  )
}

export default Draw
