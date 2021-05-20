/*
  Mocking data used for unit tests.
*/

'use strict'

const avalanche = require('avalanche')
const wallet = require('./avax-wallet.json')
const { BN, BinTools } = avalanche
const avm = require('avalanche/dist/apis/avm')
const binTools = BinTools.getInstance()

const avax = new avalanche.Avalanche('AVAX_IP', 9650)
const xchain = avax.XChain()

const addresses = [xchain.parseAddress(wallet.addressString)]

const avaxString = 'FvwEAhmxKfeiG8SnEvq42hc6whRyY3EFYAvebMqDNDGCgxN5Z'
const avaxID = binTools.cb58Decode(avaxString)

const empty = new avm.UTXOSet()
const sendUtxoSet = new avm.UTXOSet()
const codecID = binTools.fromBNToBuffer(new BN(0))
const smallUTXO = new avm.UTXO(
  codecID,
  binTools.cb58Decode('2TKfT1LrPbHYLdjiZYXRfLJ2L7yeELSyGykBikMji3mP92oW1h'),
  binTools.cb58Decode('1111XiaYg'),
  avaxID,
  new avm.SECPTransferOutput(new BN(60000000), addresses)
)
sendUtxoSet.add(smallUTXO)

const mockUnspentUtxo = [
  {
    address: 'bitcoincash:qpw8hqawqt7mwhpgcnxmgshqzve7mu7ypvgs7zz50t',
    utxos: [
      {
        height: 655855,
        tx_hash:
          '81e1d1e2b3ddac806036dcca1f6cdee8b109fc13fb7fc4da683bd882055bada7',
        tx_pos: 0,
        value: 6000,
        satoshis: 6000,
        txid:
          '81e1d1e2b3ddac806036dcca1f6cdee8b109fc13fb7fc4da683bd882055bada7',
        vout: 0,
        isValid: false,
        address: 'bitcoincash:qpw8hqawqt7mwhpgcnxmgshqzve7mu7ypvgs7zz50t',
        hdIndex: 0
      }
    ]
  }
]

const mockSpentUtxo = [
  {
    address: 'bitcoincash:qpw8hqawqt7mwhpgcnxmgshqzve7mu7ypvgs7zz50t',
    utxos: [
      {
        height: 655855,
        tx_hash:
          '81e1d1e2b3ddac806036dcca1f6cdee8b109fc13fb7fc4da683bd882055bada7',
        tx_pos: 0,
        value: 1000,
        satoshis: 1000,
        txid:
          '81e1d1e2b3ddac806036dcca1f6cdee8b109fc13fb7fc4da683bd882055bada7',
        vout: 0,
        isValid: false,
        address: 'bitcoincash:qpw8hqawqt7mwhpgcnxmgshqzve7mu7ypvgs7zz50t',
        hdIndex: 0
      }
    ]
  }
]

const mockSingleUtxos = [
  {
    address: 'bitcoincash:qpw8hqawqt7mwhpgcnxmgshqzve7mu7ypvgs7zz50t',
    utxos: [
      {
        height: 655855,
        tx_hash:
          '81e1d1e2b3ddac806036dcca1f6cdee8b109fc13fb7fc4da683bd882055bada7',
        tx_pos: 0,
        value: 60000,
        satoshis: 60000,
        txid:
          '81e1d1e2b3ddac806036dcca1f6cdee8b109fc13fb7fc4da683bd882055bada7',
        vout: 0,
        isValid: false,
        address: 'bitcoincash:qpw8hqawqt7mwhpgcnxmgshqzve7mu7ypvgs7zz50t',
        hdIndex: 0
      }
    ]
  }
]

const twoUtxos = [
  {
    address: 'bitcoincash:qr50yj9lcx6nykxx9hqgell7vck0fw2va50csrxr77',
    utxos: [
      {
        height: 0,
        tx_hash:
          'fd9220601ddad7183cb63d8530c935c5006e065ea6eacd18e5aa285c88cb7220',
        tx_pos: 0,
        value: 1000,
        satoshis: 1000,
        txid:
          'fd9220601ddad7183cb63d8530c935c5006e065ea6eacd18e5aa285c88cb7220',
        vout: 0,
        isValid: false,
        address: 'bitcoincash:qr50yj9lcx6nykxx9hqgell7vck0fw2va50csrxr77',
        hdIndex: 1
      }
    ]
  },
  {
    address: 'bitcoincash:qryxufkckgdfe3cfykydez4fjjsk4p2c5usevl9lfa',
    utxos: [
      {
        height: 0,
        tx_hash:
          'fd9220601ddad7183cb63d8530c935c5006e065ea6eacd18e5aa285c88cb7220',
        tx_pos: 1,
        value: 556,
        satoshis: 556,
        txid:
          'fd9220601ddad7183cb63d8530c935c5006e065ea6eacd18e5aa285c88cb7220',
        vout: 1,
        isValid: false,
        address: 'bitcoincash:qryxufkckgdfe3cfykydez4fjjsk4p2c5usevl9lfa',
        hdIndex: 23
      }
    ]
  }
]

module.exports = {
  mockUnspentUtxo,
  mockSpentUtxo,
  mockSingleUtxos,
  twoUtxos,
  sendUtxoSet,
  empty,
  avaxString,
  avaxID

}
