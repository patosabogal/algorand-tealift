import { Accordion, AccordionItem, AccordionButton, AccordionIcon, Box, AccordionPanel } from '@chakra-ui/react'
import { type AccorditionProps } from '../interfaces/interfaces'

const AccordionGraphCode = ({ nodeArray, contentArray }: AccorditionProps): JSX.Element => {
  return (
        <>
        <Accordion defaultIndex={[0]} allowMultiple w={'90%'}>
            {
                nodeArray.map((node, index) => {
                  return (
                        <AccordionItem key={index}>
                            <h2>
                            <AccordionButton>
                                <Box as="span" flex='1' textAlign='left' fontWeight={'bold'}>
                                    {node}
                                </Box>
                                <AccordionIcon />
                            </AccordionButton>
                            </h2>
                            <AccordionPanel pb={4}>
                                {contentArray[index]}
                            </AccordionPanel>
                        </AccordionItem>
                  )
                })
            }
    </Accordion>
    </>
  )
}

export default AccordionGraphCode
