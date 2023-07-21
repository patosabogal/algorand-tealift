import {
  Button, Modal, ModalOverlay, useDisclosure, ModalContent,
  ModalHeader, ModalCloseButton, ModalBody, ModalFooter
} from '@chakra-ui/react'
import { type ModalProps } from '../interfaces/interfaces'
import { MdExpand } from 'react-icons/md'

const ModalButton = ({ image }: ModalProps): JSX.Element => {
  const { isOpen, onOpen, onClose } = useDisclosure()
  return (
      <>
        <Button variant='ghost' leftIcon={<MdExpand/>} colorScheme='blue' onClick={onOpen} mb={5}>Fullscreen</Button>

        <Modal isOpen={isOpen} onClose={onClose} size={'full'}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Graph</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
                <img src={image} alt="tealift" width={'auto'} />
            </ModalBody>

            <ModalFooter>
              <Button colorScheme='blue' mr={3} onClick={onClose}>
                Close
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </>
  )
}

export default ModalButton
