'use strict'

const assert = require('chai').assert
const sinon = require('sinon')
const cloneDeep = require('lodash.clonedeep')

// Library under test.
const SendTokens = require('../../src/commands/send-tokens')

// Mock data
const testUtil = require('../util/test-util')
const testwallet = require('../mocks/avax-wallet.json')
const sendMockData = require('../mocks/send-mocks')
const avaxMockData = require('../mocks/avax-mock')

// Inspect utility used for debugging.
const util = require('util')
util.inspect.defaultOptions = {
  showHidden: true,
  colors: true,
  depth: 1
}

// Set default environment variables for unit tests.
if (!process.env.TEST) process.env.TEST = 'unit'

describe('#send-tokens', () => {
  let mockedWallet
  let uut // unit under test
  let sandbox
  let mockData

  before(() => {
    testUtil.restoreAvaxWallet()
  })

  beforeEach(() => {
    mockedWallet = Object.assign({}, testwallet) // Clone the testwallet
    mockData = cloneDeep(sendMockData)
    sandbox = sinon.createSandbox()
    uut = new SendTokens()

    delete require.cache[require.resolve('../../wallets/test123')]
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#validateFlags', () => {
    it('should throw error if name is not supplied.', () => {
      try {
        uut.validateFlags({})
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a wallet with the -n flag',
          'Expected error message.'
        )
      }
    })

    it('should throw error if token quantity is not supplied.', () => {
      try {
        const flags = {
          name: 'testwallet'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a quantity of tokens with the -q flag',
          'Expected error message.'
        )
      }
    })

    it('should throw error if recieving address is not supplied.', () => {
      try {
        const flags = {
          name: 'testwallet',
          qty: 0.1
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a send-to address with the -a flag.',
          'Expected error message.'
        )
      }
    })

    it('should throw error if token ID is not supplied.', () => {
      try {
        const flags = {
          name: 'testwallet',
          qty: 0.1,
          sendAddr: 'abc'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specifcy the avalanche token ID',
          'Expected error message.'
        )
      }
    })

    it('should throw error if receiving address is not valid.', () => {
      try {
        const flags = {
          name: 'testwallet',
          qty: 0.1,
          sendAddr: 'abc',
          tokenId: 'abc'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a valid avalanche',
          'Expected error message.'
        )
      }
    })

    it('should return true if all flags are supplied.', () => {
      const flags = {
        name: 'testwallet',
        qty: 1.5,
        sendAddr: 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9',
        tokenId: 'c4b0d62156b3fa5c8f3436079b5394f7edc1bef5dc1cd2f9d0c4d46f82cca479'
      }

      const result = uut.validateFlags(flags)

      assert.equal(result, true)
    })
  })

  describe('#getTokenUtxos', () => {
    it('should throw an error if there are no matching token utxos in wallet.', () => {
      try {
        const tokenId = avaxMockData.quikString
        mockedWallet.otherUtxos = null
        uut.getTokenUtxos(tokenId, mockedWallet)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'No tokens in the wallet matched the given token ID',
          'Expected error message.'
        )
      }
    })

    it('should return UTXOs matching token ID.', () => {
      const tokenId = avaxMockData.quikString

      const tokenUtxos = uut.getTokenUtxos(tokenId, mockedWallet)
      assert.equal(tokenUtxos.length, 1) // Should return 1 UTXO from mock wallet.
    })
  })

  describe('#sendTokens', () => {
    it('should throw an error if the tokenUtxos is empty', async () => {
      const tokenUtxos = []
      const qty = 2
      const sendToAddr = 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
      const changeAddr = mockedWallet.addresses['0']
      const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[0]

      try {
        mockedWallet.otherUtxos = null
        await uut.sendTokens(
          avaxUtxo,
          tokenUtxos,
          qty,
          sendToAddr,
          changeAddr,
          mockedWallet,
          ''
        )

        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'At least one utxo',
          'Expected error message.'
        )
      }
    })

    it('should throw an error if the avaxUtxo doesnt have enough for fee', async () => {
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

      const tokenId = avaxMockData.quikString
      const tokenUtxos = uut.getTokenUtxos(tokenId, mockedWallet)
      const qty = 2
      const sendToAddr = 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
      const changeAddr = mockedWallet.addresses['0']
      const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[0]
      avaxUtxo.hdIndex = 1
      avaxUtxo.amount = 0

      try {
        mockedWallet.otherUtxos = null
        await uut.sendTokens(
          avaxUtxo,
          tokenUtxos,
          qty,
          sendToAddr,
          changeAddr,
          mockedWallet,
          ''
        )
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'Not enough avax',
          'Expected error message.'
        )
      }
    })

    it('should throw an error if the token amount if bigger than balance', async () => {
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
      sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 2 })

      const tokenId = avaxMockData.quikString
      const tokenUtxos = uut.getTokenUtxos(tokenId, mockedWallet)
      const qty = 5
      const sendToAddr = 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
      const changeAddr = mockedWallet.addresses['0']
      const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[1]
      avaxUtxo.hdIndex = 1

      try {
        mockedWallet.otherUtxos = null
        await uut.sendTokens(
          avaxUtxo,
          tokenUtxos,
          qty,
          sendToAddr,
          changeAddr,
          mockedWallet,
          ''
        )
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'Not enough tokens',
          'Expected error message.'
        )
      }
    })

    // Output 1: remaining avax
    // Output 2: sent ant
    // Output 3: remaining ant
    it('should return a transaction object with two outputs', async () => {
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
      sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 2 })

      const tokenId = avaxMockData.quikString
      const tokenUtxos = uut.getTokenUtxos(tokenId, mockedWallet)
      const qty = 4.9
      const sendToAddr = 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
      const changeAddr = mockedWallet.addresses['0']
      const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[1]
      avaxUtxo.hdIndex = 1

      try {
        mockedWallet.otherUtxos = null
        const signed = await uut.sendTokens(
          avaxUtxo,
          tokenUtxos,
          qty,
          sendToAddr,
          changeAddr,
          mockedWallet,
          ''
        )

        assert.equal(signed._typeName, 'Tx', 'Tx Expected')

        const outs = signed.getUnsignedTx().getTransaction().getOuts()
        assert.equal(outs.length, 2, 'Only two output expected')
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result')
      }
    })

    it('should return a transaction object with three outputs', async () => {
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
      sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 2 })

      const tokenId = avaxMockData.quikString
      const tokenUtxos = uut.getTokenUtxos(tokenId, mockedWallet)
      const qty = 0.5
      const sendToAddr = 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
      const changeAddr = mockedWallet.addresses['0']
      const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[1]
      avaxUtxo.hdIndex = 1

      try {
        mockedWallet.otherUtxos = null
        const signed = await uut.sendTokens(
          avaxUtxo,
          tokenUtxos,
          qty,
          sendToAddr,
          changeAddr,
          mockedWallet,
          ''
        )

        assert.equal(signed._typeName, 'Tx', 'Tx Expected')

        const outs = signed.getUnsignedTx().getTransaction().getOuts()
        assert.equal(outs.length, 3, 'Only three output expected')
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result')
      }
    })

    it('should return a transaction object with one output', async () => {
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
      sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 2 })

      const tokenId = avaxMockData.quikString
      const tokenUtxos = uut.getTokenUtxos(tokenId, mockedWallet)
      const qty = 4.9
      const sendToAddr = 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
      const changeAddr = mockedWallet.addresses['0']
      const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[2]
      avaxUtxo.hdIndex = 1
      avaxUtxo.amount = 1000000

      try {
        mockedWallet.otherUtxos = null
        const signed = await uut.sendTokens(
          avaxUtxo,
          tokenUtxos,
          qty,
          sendToAddr,
          changeAddr,
          mockedWallet,
          ''
        )

        assert.equal(signed._typeName, 'Tx', 'Tx Expected')

        const outs = signed.getUnsignedTx().getTransaction().getOuts()
        assert.equal(outs.length, 1, 'Only one output expected')
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result')
      }
    })
  })

  describe('#run', () => {
    it('should throw error if theres no utxo to pay the fee', async () => {
      testUtil.restoreAvaxWallet()
      const flags = {
        name: 'test123',
        qty: 1.5,
        sendAddr: 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9',
        tokenId: avaxMockData.quikString
      }

      sandbox.stub(uut, 'parse').returns({ flags })
      sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)
      sandbox.stub(uut.send, 'selectUTXO').resolves({})
      const rest = await uut.run()
      assert.equal(rest, 0, 'Unexpected result')
    })

    it('should return the txid for a new transaction', async () => {
      testUtil.restoreAvaxWallet()
      try {
        const flags = {
          name: 'test123',
          qty: 1.5,
          sendAddr: 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9',
          tokenId: avaxMockData.quikString,
          memo: 'CLI in action'
        }

        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 2 })
        sandbox.stub(uut, 'parse').returns({ flags })
        sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)
        sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves('anewtxid')

        const txid = await uut.run()
        assert.equal(txid, 'anewtxid', 'Expected txid')
      } catch (error) {
        console.log(error)
        assert.fail('Unexpected result')
      }
    })
  })
})
