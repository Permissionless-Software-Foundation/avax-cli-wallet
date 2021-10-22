'use strict'

const assert = require('chai').assert
const sinon = require('sinon')
const cloneDeep = require('lodash.clonedeep')

// Library under test.
const MakeOffer = require('../../src/commands/make-offer')

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

describe('#make-offer', () => {
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
    uut = new MakeOffer()

    delete require.cache[require.resolve('../../wallets/test123')]
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#validateFlags', () => {
    it('should throw error if name is not supplied', () => {
      try {
        uut.validateFlags({})
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a wallet with the -n flag',
          'Expected error message'
        )
      }
    })

    it('should throw error if operations is not set', () => {
      try {
        const flags = {
          name: 'testwallet'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specifcy the operation type (either sell or buy) with the -o flag',
          'Expected error message'
        )
      }
    })

    it('should throw error if token amount it not supplied', () => {
      try {
        const flags = {
          name: 'testwallet',
          operation: 'sell'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a token quantity with the -q flag',
          'Expected error message'
        )
      }
    })

    it('should throw error if avax amount it not supplied', () => {
      try {
        const flags = {
          name: 'testwallet',
          operation: 'sell',
          amount: 500
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify an avax quantity with the -a flag',
          'Expected error message'
        )
      }
    })

    it('should throw error if asset id it not supplied', () => {
      try {
        const flags = {
          name: 'testwallet',
          operation: 'sell',
          amount: 500,
          avax: 1000000
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specifcy the assetID ID with the -t flag',
          'Expected error message'
        )
      }
    })

    it('should return true if all flags are supplied', () => {
      const flags = {
        name: 'testwallet',
        operation: 'sell',
        amount: 500,
        avax: 1000000,
        tokenId: 'sometoken'
      }

      const result = uut.validateFlags(flags)

      assert.equal(result, true)
    })
  })

  describe('#sell', () => {
    it('should throw an error if there are no matching token utxos in wallet', async () => {
      try {
        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

        const tokenId = avaxMockData.quikString

        mockedWallet.otherUtxos = []
        await uut.sell(mockedWallet, tokenId, 500, 100)
        assert.fail('Unexpected result')
      } catch (err) {
        console.log(err)
        assert.include(
          err.message,
          'No tokens in the wallet matched the given token ID',
          'Expected error message'
        )
      }
    })

    it('should throw an error if the given token amount is higher than held', async () => {
      try {
        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

        const tokenId = avaxMockData.quikString

        await uut.sell(mockedWallet, tokenId, 500, 100)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'Not enough tokens to be send',
          'Expected error message'
        )
      }
    })

    it('should return the transaction hex and the address reference object', async () => {
      try {
        const tokenId = avaxMockData.quikString
        const addressWithTokens = mockedWallet.addresses['1']

        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

        const sellObj = await uut.sell(mockedWallet, tokenId, 400, 100)

        assert.hasAllKeys(sellObj, ['txHex', 'addrReferences'])
        const [address] = Object.values(sellObj.addrReferences)
        assert.equal(address, addressWithTokens)
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result')
      }
    })
  })

  describe('#run', () => {
    it('should return the transaction hex and the address reference object from the sell method', async () => {
      try {
        const flags = {
          name: 'test123',
          amount: 400,
          avax: 10000000,
          operation: 'sell',
          tokenId: avaxMockData.quikString
        }

        const addressWithTokens = mockedWallet.addresses['1']

        sandbox.stub(uut, 'parse').returns({ flags })
        sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)
        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

        const sellObj = await uut.run()

        assert.hasAllKeys(sellObj, ['txHex', 'addrReferences'])
        const [address] = Object.values(sellObj.addrReferences)
        assert.equal(address, addressWithTokens)
      } catch (error) {
        console.log(error.message)
        assert.fail('Unexpected result')
      }
    })

    it('should return (for now) en empty object', async () => {
      try {
        const flags = { operation: 'buy' }

        sandbox.stub(uut, 'parse').returns({ flags })
        sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)

        const buyObj = await uut.run()

        assert.equal(Object.keys(buyObj).length, 0)
      } catch (error) {
        console.log(error.message)
        assert.fail('Unexpected result')
      }
    })
  })
})
