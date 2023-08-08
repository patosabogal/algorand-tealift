import {
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionIcon,
  Box,
  AccordionPanel
} from '@chakra-ui/react'
import { type AccorditionProps } from '../interfaces/interfaces'

const AccordionGraphCode = ({ dotGraph }: AccorditionProps): JSX.Element => {
  const arrayGraph = dotGraph.match(/.{1,100}/g)
  const nodes: string[] = []
  const contents: string[] = []
  if (arrayGraph != null) {
    for (let i = 5; i < arrayGraph.length; i++) {
      if (arrayGraph[i].includes('node')) {
        nodes.push(arrayGraph[i].slice(0, 8).split('"').join(''))
      }
      if (arrayGraph[i].includes('[')) {
        contents.push(arrayGraph[i].split('"').join(''))
      }
    }
  }
  return (
    <Accordion defaultIndex={[0]} allowMultiple w={'90%'}>
      {nodes.map((node, index) => (
        <AccordionItem key={index}>
          <h2>
            <AccordionButton>
              <Box as="span" flex="1" textAlign="left" fontWeight={'bold'}>
                {node}
              </Box>
              <AccordionIcon />
            </AccordionButton>
          </h2>
          <AccordionPanel pb={4}>{contents[index]}</AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

export default AccordionGraphCode
