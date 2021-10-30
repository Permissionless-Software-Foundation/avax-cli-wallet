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

    sandbox.stub(uut, 'log').returns(null)
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
          'You must specifiy the operation type (either sell or buy) with the -o flag',
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
          'You must specifiy the assetID ID with the -t flag',
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

    it('should throw an error if the tx hex is not passed', () => {
      try {
        const flags = {
          name: 'testwallet',
          operation: 'buy'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify transaction hex with the -h flag',
          'Expected error message'
        )
      }
    })

    it('should throw an error if the addresses reference is not defined', () => {
      try {
        const flags = {
          name: 'testwallet',
          operation: 'buy',
          txHex: 'somehex'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify the utxos address reference',
          'Expected error message'
        )
      }
    })

    it('should throw an error if the addresses reference is not a valid JSON', () => {
      try {
        const flags = {
          name: 'testwallet',
          operation: 'buy',
          txHex: 'somehex',
          referece: 'a plain string'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'Unexpected token a in JSON at position 0',
          'Expected error message'
        )
      }
    })

    it('should return true if its a buy operation', () => {
      const { hex, addrReferences } = avaxMockData.aliceTx

      const flags = {
        name: 'testwallet',
        operation: 'buy',
        txHex: hex,
        referece: addrReferences
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
        const references = JSON.parse(sellObj.addrReferences)
        const [address] = Object.values(references)
        assert.equal(address, addressWithTokens)
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result')
      }
    })
  })

  describe('#buy', () => {
    it('should throw an error if the hex is invalid', async () => {
      try {
        const { addrReferences } = avaxMockData.aliceTx

        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        mockedWallet.avaxUtxos = []

        await uut.buy(mockedWallet, '0000000', addrReferences)
        assert.fail('Unexpected result')
      } catch (err) {
        console.log(err)
        assert.include(
          err.message,
          'Trying to access beyond buffer length',
          'Expected error message'
        )
      }
    })

    it('should throw an error if the address reference is not a JSON object', async () => {
      try {
        const { hex } = avaxMockData.aliceTx

        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        mockedWallet.avaxUtxos = []

        await uut.buy(mockedWallet, hex, 'a plain string')
        assert.fail('Unexpected result')
      } catch (err) {
        console.log(err)
        assert.include(
          err.message,
          'Unexpected token a in JSON at position 0',
          'Expected error message'
        )
      }
    })

    it('should throw an error if there is not enough avax to buy the token', async () => {
      try {
        const { hex, addrReferences } = avaxMockData.aliceTx

        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        sandbox.stub(uut.send.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        sandbox.stub(uut.send.xchain, 'getAssetDescription').resolves({ denomination: 9 })
        mockedWallet.avaxUtxos = []

        await uut.buy(mockedWallet, hex, addrReferences)
        assert.fail('Unexpected result')
      } catch (err) {
        console.log(err)
        assert.include(
          err.message,
          'Not enough avax in the selected utxo',
          'Expected error message'
        )
      }
    })

    it('should return the transaction hex and the address reference object', async () => {
      try {
        const { hex, addrReferences } = avaxMockData.aliceTx

        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        sandbox.stub(uut.send.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        sandbox.stub(uut.send.xchain, 'getAssetDescription').resolves({ denomination: 9 })

        const buyObj = await uut.buy(mockedWallet, hex, addrReferences)

        assert.hasAllKeys(buyObj, ['txHex', 'addrReferences'])
        const references = JSON.parse(buyObj.addrReferences)
        const [address] = Object.values(references)
        assert.equal(address, 'X-avax14car4ja7pj6gctcwzaa7saslfxd9r7wureq59z')
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result')
      }
    })
  })

  describe('#accept', () => {
    it('should throw an error if the hex is invalid', async () => {
      try {
        const { addrReferences } = avaxMockData.bobTx

        sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves('transactionId')

        await uut.accept(mockedWallet, '0000000', addrReferences)
        assert.fail('Unexpected result')
      } catch (err) {
        console.log(err)
        assert.include(
          err.message,
          'Trying to access beyond buffer length',
          'Expected error message'
        )
      }
    })

    it('should throw an error if the address reference is not a JSON object', async () => {
      try {
        const { hex } = avaxMockData.bobTx

        sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves('transactionId')

        await uut.accept(mockedWallet, hex, 'a plain string')
        assert.fail('Unexpected result')
      } catch (err) {
        console.log(err)
        assert.include(
          err.message,
          'Unexpected token a in JSON at position 0',
          'Expected error message'
        )
      }
    })

    it('should throw an error if the signatures are not completed', async () => {
      try {
        const { hex } = avaxMockData.bobTx
        const addrReferences = {
          eLbJ2fMdmk6jUCDuptiny9ddN2oL8MKW9hc5buAmWbkhZxa9v: 'X-avax1xjx5hvy3ckkaeqgj3cege6xrpdvc23vfru3jg1',
          GNktsj6LCc1R5eqGkwYofwJwYobZ3dqVqfcpvc9JFepm7RE6k: 'X-avax1xjx5hvy3ckkaeqgj3cege6xrpdvc23vfru3jg0'
        }
        mockedWallet.nextAddress = 1

        sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves('transactionId')

        await uut.accept(mockedWallet, hex, JSON.stringify(addrReferences))
        assert.fail('Unexpected result')
      } catch (err) {
        console.log(err)
        assert.include(
          err.message,
          'The transaction is not fully signed',
          'Expected error message'
        )
      }
    })

    it('should return the transaction id', async () => {
      try {
        const { hex, addrReferences } = avaxMockData.bobTx

        sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves('transactionId')

        const acceptObj = await uut.accept(mockedWallet, hex, addrReferences)

        assert.hasAllKeys(acceptObj, ['txid'])
        assert.equal(acceptObj.txid, 'transactionId')
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
        sandbox
          .stub(uut.updateBalances, 'updateBalances')
          .resolves(mockedWallet)
        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

        const sellObj = await uut.run()

        assert.hasAllKeys(sellObj, ['txHex', 'addrReferences'])
        const references = JSON.parse(sellObj.addrReferences)
        const [address] = Object.values(references)
        assert.equal(address, addressWithTokens)
      } catch (error) {
        console.log(error.message)
        assert.fail('Unexpected result')
      }
    })

    it('should return the transaction hex for a transaction without remainder', async () => {
      try {
        const flags = {
          name: 'test123',
          amount: 490,
          avax: 10000000,
          operation: 'sell',
          tokenId: avaxMockData.quikString
        }

        const addressWithTokens = mockedWallet.addresses['1']

        sandbox.stub(uut, 'parse').returns({ flags })
        sandbox
          .stub(uut.updateBalances, 'updateBalances')
          .resolves(mockedWallet)
        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

        const sellObj = await uut.run()

        assert.hasAllKeys(sellObj, ['txHex', 'addrReferences'])
        const references = JSON.parse(sellObj.addrReferences)
        const [address] = Object.values(references)
        assert.equal(address, addressWithTokens)
      } catch (error) {
        console.log(error.message)
        assert.fail('Unexpected result')
      }
    })

    it('should return a tx hex for a partially signed transaction', async () => {
      try {
        const { hex, addrReferences } = avaxMockData.aliceTx
        const addressWithAvax = 'X-avax14car4ja7pj6gctcwzaa7saslfxd9r7wureq59z'

        const flags = {
          name: 'test123',
          operation: 'buy',
          txHex: hex,
          referece: addrReferences
        }

        sandbox.stub(uut, 'parse').returns({ flags })
        sandbox
          .stub(uut.updateBalances, 'updateBalances')
          .resolves(mockedWallet)
        sandbox
          .stub(uut.xchain, 'getAVAXAssetID')
          .resolves(mockData.avaxID)
        sandbox
          .stub(uut.send.xchain, 'getAVAXAssetID')
          .resolves(mockData.avaxID)
        sandbox
          .stub(uut.send.xchain, 'getAssetDescription')
          .resolves({ denomination: 9 })

        const buyObj = await uut.run()

        assert.hasAllKeys(buyObj, ['txHex', 'addrReferences'])
        const references = JSON.parse(buyObj.addrReferences)
        const [address] = Object.values(references)
        assert.equal(address, addressWithAvax)
      } catch (error) {
        console.log(error.message)
        assert.fail('Unexpected result')
      }
    })

    it('should return a txid for the completed transaction', async () => {
      try {
        const { hex, addrReferences } = avaxMockData.bobTx
        const flags = {
          name: 'test123',
          operation: 'accept',
          txHex: hex,
          referece: addrReferences
        }

        sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves('transactionId')
        sandbox.stub(uut, 'parse').returns({ flags })
        sandbox
          .stub(uut.updateBalances, 'updateBalances')
          .resolves(mockedWallet)

        const acceptObj = await uut.run()

        assert.hasAllKeys(acceptObj, ['txid'])
        assert.equal(acceptObj.txid, 'transactionId')
      } catch (error) {
        console.log(error.message)
        assert.fail('Unexpected result')
      }
    })

    it('should return 0 and display error.message on empty flags', async () => {
      sandbox.stub(uut, 'parse').returns({ flags: {} })

      const result = await uut.run()

      assert.equal(result, 0)
    })
  })
})
