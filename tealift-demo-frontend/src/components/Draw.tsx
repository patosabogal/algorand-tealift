/* eslint-disable react/no-children-prop */
import {
  Box,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Text,
  // Code,
  Button,
  Stack,
  Image
} from '@chakra-ui/react'
import { MdCopyAll } from 'react-icons/md'
import { Graphviz } from '@hpcc-js/wasm/graphviz'
import { useEffect, useContext, useState } from 'react'
import Context from '../context/Context'
import { type TealContextType } from '../interfaces/interfaces'
import defaultImage from '../assets/tealift.svg'
import 'd3-graphviz'
import * as d3 from 'd3'
import ModalButton from './Modal'
import AccordionGraphCode from './Accordion'

// FIX TYPES
const doGraph = (graph: any): void => {
  let dotIndex = 0
  const graphviz = d3.select('#graph').graphviz()
    .transition(function (): any {
      return d3.transition()
        .ease(d3.easeLinear)
        .delay(100)
        .duration(500)
    })
    .logEvents(false)
    .on('initEnd', render)

  const attributer = (datum: any): void => {
    const selection = d3.select(this as any)
    if (datum.tag === 'svg') {
      const width = '600'
      const height = '260'
      const x = '10'
      const y = '10'
      selection
        .attr('width', width + 'pt')
        .attr('height', height + 'pt')
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        .attr('viewBox', -x + ' ' + -y + ' ' + width + ' ' + height)
      datum.attributes.width = width + 'pt'
      datum.attributes.height = height + 'pt'
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      datum.attributes.viewBox = -x + ' ' + -y + ' ' + width + ' ' + height
    }
  }

  function render (): void {
    const dotLines = dots[dotIndex % dots.length]
    const dot = dotLines.join('')
    graphviz
      .tweenShapes(false)
      .dot(dot)
      .attributer(attributer)
      .render()
      .on('end', function () {
        if (dotIndex !== 0) {
          render()
        }
      })
    dotIndex += 1
  }

  const dots = [
    [
      graph
    ]
  ]
}

const Draw = (): JSX.Element => {
  const { tealContext } = useContext(Context) as TealContextType
  const [graphURL, setGraphURL] = useState<string>(defaultImage)
  const graphvizLoad = Graphviz.load()
  const [copied, setCopied] = useState<boolean>(false)
  const [nodes, setNodes] = useState<string[]>([])
  const [content, setContent] = useState<string[]>([])

  useEffect(() => {
    void draw()
    doGraph(tealContext.graph)
  }, [tealContext])

  async function draw (): Promise<void> {
    if (tealContext.graph === '') setGraphURL(defaultImage)
    const arrayGraph = tealContext.graph.match(/.{1,100}/g)
    const arrayNodes = []
    const arrayContent = []
    if (arrayGraph != null) {
      for (let i = 5; i < arrayGraph.length; i++) {
        if (arrayGraph[i].includes('node')) {
          arrayNodes.push(arrayGraph[i].slice(0, 8).split('"').join(''))
        }
        if (arrayGraph[i].includes('[')) {
          arrayContent.push(arrayGraph[i].split('"').join(''))
        }
      }
    }
    setContent(arrayContent)
    setNodes(arrayNodes)
    const graphviz = await graphvizLoad
    const svgString = graphviz.layout(tealContext.graph, 'svg', 'dot')
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' })
    const blobURL = URL.createObjectURL(svgBlob)
    setGraphURL(blobURL)
  }

  return (
    <Box width="60%" marginTop={20} marginBottom={0} textAlign="center">
      <Tabs isFitted variant="enclosed">
        <TabList mb="1em">
          <Tab fontWeight="bold">Draw</Tab>
          <Tab fontWeight="bold">Graph Code</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <ModalButton image={graphURL} downloadUrl={graphURL} />
            <Text fontSize={20}>
              {
                tealContext.graph === ''
                  ? <Image ml='auto' mr='auto' h={300} src={defaultImage} alt="graph" />
                  : <></>
              }
              <div id="graph" />
              <Button
                marginLeft="auto"
                marginRight="auto"
                marginTop={5}
                colorScheme="blue"
                variant="outline"
              >
                <a href={graphURL} download="tealift-graph.svg">
                  Download graph
                </a>
              </Button>
            </Text>
          </TabPanel>
          <TabPanel>
            {tealContext.graph === ''
              ? (
              <Text fontSize={20}>No graph to print</Text>
                )
              : (
                <Stack alignItems='center'>
                  {/* <Code
                    borderRadius={10}
                    maxWidth="70%"
                    padding={5}
                    children={`${tealContext.graph.slice(0, 750)}...`}
                  /> */}
                  <AccordionGraphCode nodeArray={nodes} contentArray={content} />
                  <Button
                    leftIcon={<MdCopyAll />}
                    alignItems='center' w={40}
                    colorScheme='blue'
                    variant='ghost'
                    onClick={() => {
                      void navigator.clipboard.writeText(tealContext.graph)
                      setCopied(true)
                    }
                    }
                  >
                    {
                      copied ? 'Copied!' : 'Copy Graph'
                    }
                  </Button>
                </Stack>
                )}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  )
}

export default Draw
