'use strict'

const assert = require('chai').assert
const sinon = require('sinon')
const cloneDeep = require('lodash.clonedeep')

// Library under test.
const SendAll = require('../../src/commands/send-all')
// const config = require('../../config')

// Mocking data
const testUtil = require('../util/test-util')
const testwallet = require('../mocks/avax-wallet.json')
const sendMockData = require('../mocks/send-mocks')

// Inspect utility used for debugging.
const util = require('util')
util.inspect.defaultOptions = {
  showHidden: true,
  colors: true,
  depth: 1
}

// Set default environment variables for unit tests.
if (!process.env.TEST) process.env.TEST = 'unit'

describe('Send All', () => {
  let mockedWallet
  let uut // unit under test
  let sandbox
  let mockData

  beforeEach(() => {
    mockedWallet = cloneDeep(testwallet) // Clone the testwallet
    mockData = cloneDeep(sendMockData)
    sandbox = sinon.createSandbox()
    uut = new SendAll()

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

    it('should throw error if recieving address is not supplied.', () => {
      try {
        const flags = {
          name: 'testwallet'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a sent-to address with the -a flag.',
          'Expected error message.'
        )
      }
    })

    it('should throw error if recieving address is not valid.', () => {
      try {
        const flags = {
          name: 'testwallet',
          sendAddr: 'abc'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a valid avalanche address with the -a flag',
          'Expected error message.'
        )
      }
    })

    it('should return true if all flags are supplied.', () => {
      const flags = {
        name: 'testwallet',
        sendAddr: 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
      }

      const result = uut.validateFlags(flags)

      assert.equal(result, true)
    })
  })

  describe('#sendAll', () => {
    it('should throw an error for malformed UTXOs', async () => {
      try {
        const sendToAddr = 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
        mockedWallet.avaxUtxos = 'notAValidUtxo'
        mockedWallet.otherUtxos = null
        await uut.sendAll(sendToAddr, mockedWallet, '')

        assert.fail('Unexpected result!')
      } catch (err) {
        assert.include(err.message, 'utxos must be an array')
      }
    })

    it('should throw an error if theres not enough avax to pay fee', async () => {
      try {
        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        mockedWallet.avaxUtxos = null
        const sendToAddr = 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'

        await uut.sendAll(sendToAddr, mockedWallet, '')

        assert.fail('Unexpected result!')
      } catch (err) {
        console.log(err)
        assert.include(err.message, 'Not enough avax to perform this tx')
      }
    })

    it('should return a signed tx object', async () => {
      try {
        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        const sendToAddr = 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'

        const signed = await uut.sendAll(sendToAddr, mockedWallet, 'Message')
        assert.equal(signed._typeName, 'Tx', 'Tx Expected')
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result!')
      }
    })
  })

  describe('#run', () => {
    it('should return the txid for a new transaction adding an empty memo', async () => {
      try {
        testUtil.restoreAvaxWallet()
        const flags = {
          name: 'test123',
          sendAddr: 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
        }
        sandbox.stub(uut, 'parse').returns({ flags })
        sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)
        sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves('anewtxid')

        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

        const txid = await uut.run()
        assert.equal(txid, 'anewtxid', 'Expected txid')
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result!')
      }
    })

    it('should return the txid for a new transaction', async () => {
      try {
        testUtil.restoreAvaxWallet()
        const flags = {
          name: 'test123',
          sendAddr: 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9',
          memo: 'message'
        }
        sandbox.stub(uut, 'parse').returns({ flags })
        sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)
        sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves('anewtxid')

        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

        const txid = await uut.run()
        assert.equal(txid, 'anewtxid', 'Expected txid')
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result!')
      }
    })

    it('should catch an error', async () => {
      try {
        testUtil.restoreAvaxWallet()
        const flags = {
          name: 'test123'
        }

        sandbox.stub(uut, 'parse').returns({ flags })

        const rest = await uut.run()
        assert.equal(rest, 0, 'Unexpected result')
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result!')
      }
    })
  })
})
