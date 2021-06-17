const { BinTools, BN, Avalanche } = require('avalanche')
const avm = require('avalanche/dist/apis/avm')
// const wallet = require('./avax-wallet')
const bintools = BinTools.getInstance()

const ava = new Avalanche('AVAX_IP', 9650)
const xchain = ava.XChain()

const testAddr = 'X-avax1xjx5hvy3ckkaeqgj3cege6xrpdvc23vfru3jg0'
const addrBuffer = [xchain.parseAddress(testAddr)]

const avaxString = 'FvwEAhmxKfeiG8SnEvq42hc6whRyY3EFYAvebMqDNDGCgxN5Z'
const avaxID = bintools.cb58Decode(avaxString)

const quikString = '2tEi6r6PZ9VXHogUmkCzvijmW81TRNjtKWnR4FA55zTPc87fxC'
const quikBuffer = bintools.cb58Decode('2tEi6r6PZ9VXHogUmkCzvijmW81TRNjtKWnR4FA55zTPc87fxC')

const arpString = '2XveqafoVaFzkRJaTd6HyAAhxzVQ8P3ijMQZ5DnELMGG1J36Tv'
const arpBuffer = bintools.cb58Decode('2XveqafoVaFzkRJaTd6HyAAhxzVQ8P3ijMQZ5DnELMGG1J36Tv')

const assets = [
  { asset: 'AVAX', balance: '58000000' },
  {
    asset: quikString,
    balance: '89400'
  },
  {
    asset: arpString,
    balance: '490'
  }
]

const assetDetails = [
  {
    name: 'Avalanche',
    symbol: 'AVAX',
    assetID: avaxID,
    denomination: 9
  },
  {
    name: 'QUIK COIN',
    symbol: 'QUIK',
    assetID: quikBuffer,
    denomination: 2
  },
  {
    name: 'AREPA TOKEN',
    symbol: 'ARP',
    assetID: arpBuffer,
    denomination: 2
  }
]

const balance = {
  address: testAddr,
  navaxAmount: 0.58,
  hdIndex: 1,
  assets: [
    {
      name: 'Avalanche',
      symbol: 'AVAX',
      assetID: avaxString,
      denomination: 9,
      balance: '58000000'
    },
    {
      name: 'QUIK COIN',
      symbol: 'QUIK',
      assetID: quikString,
      denomination: 2,
      balance: '89400'
    },
    {
      name: 'AREPA TOKEN',
      symbol: 'ARP',
      assetID: arpString,
      denomination: 2,
      balance: '490'
    }
  ]
}

const codecID = bintools.fromBNToBuffer(new BN(0))
const utxos = [
  new avm.UTXO(
    codecID,
    bintools.cb58Decode('GNktsj6LCc1R5eqGkwYofwJwYobZ3dqVqfcpvc9JFepoe5zFT'),
    Buffer.from('00000000', 'hex'),
    avaxID,
    new avm.SECPTransferOutput(new BN(58000000), addrBuffer)
  ),
  new avm.UTXO(
    codecID,
    bintools.cb58Decode('GNktsj6LCc1R5eqGkwYofwJwYobZ3dqVqfcpvc9JFepoe5zFT'),
    Buffer.from('00000001', 'hex'),
    arpBuffer,
    new avm.SECPTransferOutput(new BN(490), addrBuffer)
  ),
  new avm.UTXO(
    codecID,
    bintools.cb58Decode('GNktsj6LCc1R5eqGkwYofwJwYobZ3dqVqfcpvc9JFepoe5zFT'),
    Buffer.from('00000002', 'hex'),
    quikBuffer,
    new avm.SECPTransferOutput(new BN(200), addrBuffer)
  )
]

const utxoSet = new avm.UTXOSet()
const emptyUtxoSet = new avm.UTXOSet()
utxoSet.addArray(utxos)

module.exports = {
  assets,
  avaxID,
  balance,
  utxos,
  utxoSet,
  emptyUtxoSet,
  quikString,
  assetDetails
}
