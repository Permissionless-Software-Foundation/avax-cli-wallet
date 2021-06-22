'use strict'

const assert = require('chai').assert
const sinon = require('sinon')
const cloneDeep = require('lodash.clonedeep')

// Library under test.
const SlpAvaxBridge = require('../../src/commands/slp-avax-bridge')

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

describe('#slp-avax-bridge', () => {
  let mockedWallet
  let uut // unit under test
  let sandbox
  let mockData

  before(() => {
    testUtil.restoreAvaxWallet()
  })

  beforeEach(() => {
    mockedWallet = cloneDeep(testwallet) // Clone the testwallet
    mockData = cloneDeep(sendMockData)
    sandbox = sinon.createSandbox()
    uut = new SlpAvaxBridge()

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

    it('should throw error if bch address is not provided.', () => {
      try {
        const flags = {
          name: 'testwallet',
          qty: 0.1,
          sendAddr: 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9',
          tokenId: 'c4b0d62156b3fa5c8f3436079b5394f7edc1bef5dc1cd2f9d0c4d46f82cca479'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'Invalid BCH or SLP Address',
          'Expected error message.'
        )
      }
    })

    it('should throw error if bch address is not valid.', () => {
      try {
        const flags = {
          name: 'testwallet',
          qty: 0.1,
          sendAddr: 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9',
          tokenId: 'c4b0d62156b3fa5c8f3436079b5394f7edc1bef5dc1cd2f9d0c4d46f82cca479',
          bchAddr: 'abc'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'Unsupported address format',
          'Expected error message.'
        )
      }
    })

    it('should return true if all flags are supplied.', () => {
      const flags = {
        name: 'testwallet',
        qty: 1.5,
        sendAddr: 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9',
        tokenId: 'c4b0d62156b3fa5c8f3436079b5394f7edc1bef5dc1cd2f9d0c4d46f82cca479',
        bchAddr: 'bitcoincash:qz30w4n4cunav9scgd3afnk6az0srn93ng5u98y34r'
      }

      const result = uut.validateFlags(flags)

      assert.equal(result, true)
    })
  })

  describe('#run', () => {
    it('should throw error if theres no utxo to pay the fee', async () => {
      testUtil.restoreAvaxWallet()
      const flags = {
        name: 'test123',
        qty: 1.5,
        sendAddr: 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9',
        tokenId: avaxMockData.quikString,
        bchAddr: 'bitcoincash:qz30w4n4cunav9scgd3afnk6az0srn93ng5u98y34r'
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
          bchAddr: 'bitcoincash:qz30w4n4cunav9scgd3afnk6az0srn93ng5u98y34r'
        }
        const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[2]
        avaxUtxo.hdIndex = 1

        sandbox.stub(uut.send, 'selectUTXO').resolves(avaxUtxo)

        sandbox.stub(uut, 'parse').returns({ flags })
        sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)
        sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves('anewtxid')

        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 2 })

        const txid = await uut.run()
        assert.equal(txid, 'anewtxid', 'Expected txid')
      } catch (error) {
        console.log(error.message)
        assert.fail('Unexpected result')
      }
    })
  })
})
