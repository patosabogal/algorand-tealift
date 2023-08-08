/* eslint-disable react/no-children-prop */
import {
  Box,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Text,
  Button,
  Stack,
  Flex
} from '@chakra-ui/react'
import { MdCopyAll, MdFullscreen } from 'react-icons/md'
import { useEffect, useContext, useState, useRef, type RefObject } from 'react'
import Context from '../context/Context'
import { type TealContextType } from '../interfaces/interfaces'
import 'd3-graphviz'
import * as d3 from 'd3'
import AccordionGraphCode from './Accordion'
import './Draw.css'
import { build_jsonified_program, format_jsonified_program } from 'tealift'

function graphAttributer (this: d3.BaseType, datum: any): void {
  const selection = d3.select(this)
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

const updateTransition = () =>
  d3.transition()
    .ease(d3.easeLinear)
    .delay(100)
    .duration(500)

function useGraph<T extends HTMLElement> (ctx: TealContextType): RefObject<T> {
  const graphRef = useRef<T>(null)
  const graph = ctx.tealContext.graph

  // Initialize the graph
  useEffect(() => {
    if (graphRef.current === null) {
      // Component is not yet mounted
      return
    }

    d3.select(graphRef.current)
      .graphviz()
      .transition(updateTransition as any /* FIXME */)
      .keyMode('id')
      .logEvents(false)
      .fit(true)
  }, [graphRef.current])

  // Draw
  useEffect(() => {
    if (require.main === module) {
      const file = process.argv[2]
      if (file === undefined) {
        console.log('Usage:', process.argv[0], process.argv[1], '<teal-file>')
        process.exit(1)
      }

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      const contents = readFileSync(file, 'utf8')

      const program = build_jsonified_program(contents, file)
      console.log(format_jsonified_program(program))

      console.log(JSON.stringify(program, null, 2))
    }

    if (graphRef.current === null) {
      // Component is not yet mounted
      return
    }

    if (graph === '') {
      // There's nothing to draw
      return
    }

    d3.select(graphRef.current)
      .graphviz()
      .tweenShapes(false)
      .dot(graph)
      .attributer(graphAttributer)
      .render()
  }, [graphRef.current, graph])

  return graphRef
}

const Draw = (): JSX.Element => {
  const tealContext = useContext<TealContextType>(Context)
  const [copied, setCopied] = useState<boolean>(false)

  const graph = tealContext.tealContext.graph
  const graphRef = useGraph<HTMLDivElement>(tealContext)
  const tabRef = useRef<HTMLDivElement>(null)

  function downloadGraph () {
    if (graphRef.current === null) {
      // Component is not yet mounted
      return
    }

    const svg = graphRef.current.innerHTML
    const svgBlob = new Blob([svg], { type: 'image/svg+xml' })
    const blobURL = URL.createObjectURL(svgBlob)
    const fakeLink = document.createElement('a')
    fakeLink.href = blobURL
    fakeLink.download = 'tealift-graph.svg'
    fakeLink.click()
    URL.revokeObjectURL(blobURL)
  }

  function copyToClipboard () {
    void navigator.clipboard.writeText(graph)
    setCopied(true)
  }

  function fullscreenGraph () {
    if (tabRef.current === null) {
      // Component is not yet mounted
      return
    }

    if (document.fullscreenElement === tabRef.current) {
      document.exitFullscreen()
    } else {
      tabRef.current.requestFullscreen()
    }
  }

  return (
    <Box width="60%" marginTop={20} marginBottom={0} textAlign="center">
      <Tabs isFitted variant="enclosed">
        <TabList mb="1em">
          <Tab fontWeight="bold">Draw</Tab>
          <Tab fontWeight="bold">Graph Code</Tab>
        </TabList>
        <TabPanels>
          <TabPanel className="graph-container" ref={tabRef}>
            <Flex direction="column" height="100%">
              <Box flex="1" ref={graphRef} />
              <Text display="block" fontSize={20}>
                <Button
                  marginLeft="auto"
                  marginRight="auto"
                  marginTop={5}
                  colorScheme="blue"
                  variant="outline"
                  onClick={downloadGraph}
                >
                  Download graph
                </Button>
                <Button
                  marginLeft="auto"
                  marginRight="auto"
                  marginTop={5}
                  colorScheme='blue'
                  variant='outline'
                  leftIcon={<MdFullscreen/>}
                  onClick={fullscreenGraph}
                >
                  Toggle fullscreen
                </Button>
              </Text>
            </Flex>
          </TabPanel>
          <TabPanel>
            {graph === ''
              ? <Text fontSize={20}>No graph to print</Text>
              : (
                <Stack alignItems='center'>
                  <AccordionGraphCode dotGraph={graph} />
                  <Button
                    leftIcon={<MdCopyAll />}
                    alignItems='center' w={40}
                    colorScheme='blue'
                    variant='ghost'
                    onClick={copyToClipboard}
                  >
                    {copied ? 'Copied!' : 'Copy Graph'}
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
function readFileSync (file: string, arg1: string) {
  throw new Error('Function not implemented.')
}
