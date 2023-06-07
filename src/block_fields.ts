/**
 * This information was extracted from
 * https://developer.algorand.org/docs/get-details/dapps/avm/teal/opcodes/
 */
export default {
  BlkSeed: {
    index: 0,
    name: 'BlkSeed',
    type: '[]byte',
    notes: ''
  },
  BlkTimestamp: {
    index: 1,
    name: 'BlkTimestamp',
    type: 'uint64',
    notes: ''
  }
} as const
