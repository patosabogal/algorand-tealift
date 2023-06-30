import { Box, Tabs, TabList, Tab, TabPanels, TabPanel, Text } from '@chakra-ui/react'
import { Graphviz } from '@hpcc-js/wasm/graphviz'
import { useEffect, useContext, useState } from 'react'
import Context from '../context/Context'
import { type TealContextType } from '../interfaces/interfaces'

const Draw = (): JSX.Element => {
  const { tealContext } = useContext(Context) as TealContextType
  const [graph, setGraph] = useState<string>()

  useEffect(() => {
    void draw()
  }, [tealContext])

  async function draw (): Promise<void> {
    const graphviz = await Graphviz.load()
    // Acá va asignado al dot el valor del tealContext graph
    const dot = `digraph Blah {
      rankdir="LR"
      node [shape="box"];
      A -> B -> C;
      B -> D;
    }`
    const htmlString = graphviz.layout(dot, 'svg', 'dot')
    setGraph(htmlString)
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
              <div dangerouslySetInnerHTML={{ __html: graph as string }}></div>
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
