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

const aliceTx = {
  hex: '00000001ed5f38341e436e5d46e2bb00b45d62ae97d1b050c64bc634ae10626739e35c4b0000000221e673' +
    '17cbc4be2aeb00677ad6462778a8f52274b9d605df2591b23027a87dff0000000700000000019bfcc000000' +
    '000000000000000000100000001348d4bb091c5addc81128e328ce8c30b59854589f808d594b0360d20f7b4' +
    '214bdb51a773d0f5eb34c5157eea285fefa5a86f5e1600000007000000000000005a0000000000000000000' +
    '0000100000001348d4bb091c5addc81128e328ce8c30b598545890000000154c7adf76472280846e57737da' +
    '7787359b80ef3353b4e0ec3034469c79bd439200000001f808d594b0360d20f7b4214bdb51a773d0f5eb34c' +
    '5157eea285fefa5a86f5e160000000500000000000001ea00000001000000000000000a73656c6c206f6666' +
    '6572',
  addrReferences: '{"eLbJ2fMdmk6jUCDuptiny9ddN2oL8MKW9hc5buAmWbkhZxa9v":"X-avax14car4ja7pj6gctcwzaa7saslfxd9r7wureq59z"}'
}

const bobTx = {
  hex: '00000000000000000001ed5f38341e436e5d46e2bb00b45d62ae97d1b050c64bc634ae10626739e35c4b00' +
    '00000321e67317cbc4be2aeb00677ad6462778a8f52274b9d605df2591b23027a87dff00000007000000000' +
    '19bfcc000000000000000000000000100000001348d4bb091c5addc81128e328ce8c30b59854589f808d594' +
    'b0360d20f7b4214bdb51a773d0f5eb34c5157eea285fefa5a86f5e1600000007000000000000005a0000000' +
    '0000000000000000100000001348d4bb091c5addc81128e328ce8c30b59854589f808d594b0360d20f7b421' +
    '4bdb51a773d0f5eb34c5157eea285fefa5a86f5e16000000070000000000000190000000000000000000000' +
    '00100000001348d4bb091c5addc81128e328ce8c30b598545890000000222e93cd6b1f746b71f938a5ee6c3' +
    '9fe580e56a40c771a39ce0024a6c6c79fb730000000121e67317cbc4be2aeb00677ad6462778a8f52274b9d' +
    '605df2591b23027a87dff000000050000000001ab3f00000000010000000054c7adf76472280846e57737da' +
    '7787359b80ef3353b4e0ec3034469c79bd439200000001f808d594b0360d20f7b4214bdb51a773d0f5eb34c' +
    '5157eea285fefa5a86f5e160000000500000000000001ea000000010000000000000009627579206f666665' +
    '7200000002000000090000000108f85373fc1f3defd95e60bb0aee3b66126ffe96aa72292212fd361490bbf' +
    'c1923103d606d6f3fe96751bcb407986b00c2fe1e84128383761e9d33e2c5fc759a000000000900000000',
  addrReferences: JSON.stringify({
    eLbJ2fMdmk6jUCDuptiny9ddN2oL8MKW9hc5buAmWbkhZxa9v: 'X-avax1xjx5hvy3ckkaeqgj3cege6xrpdvc23vfru3jg0',
    GNktsj6LCc1R5eqGkwYofwJwYobZ3dqVqfcpvc9JFepm7RE6k: 'X-avax1xjx5hvy3ckkaeqgj3cege6xrpdvc23vfru3jg0'
  })
}

const keys = [
  {
    priv: 'PrivateKey-nquc7QFDAbfqA1Vp71whVvH7NPtR2FUV1rZhvTEZd7ZA9K5XH',
    pub: 'X-avax1u8de0sha3x4sx6cwe3s922ytawtgyl2z9swvcz',
    pubHex: '02ee76dfc4382c949ccff2b0dc441775a67f864cde1df606175fb01acdc536682f'
  },
  {
    priv: 'PrivateKey-qkKf69aGcMERhT2KCPBfMW3YDCJHaFqyYNjuTovxUPdmKWFeS',
    pub: 'X-avax14car4ja7pj6gctcwzaa7saslfxd9r7wureq59z',
    pubHex: '0335f5ca4e17c0716a7e2c123f7cd2f378664b54358aec4a0697eb9805b3a8d049'
  }
]

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
  keys,
  assetDetails,
  aliceTx,
  bobTx
}
