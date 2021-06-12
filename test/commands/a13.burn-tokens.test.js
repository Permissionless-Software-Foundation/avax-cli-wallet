/*
  TODO:

*/

'use strict'

const assert = require('chai').assert
const sinon = require('sinon')
const cloneDeep = require('lodash.clonedeep')

// Library under test.
const BurnTokens = require('../../src/commands/burn-tokens')

const testUtil = require('../util/test-util')
const avaxMockData = require('../mocks/avax-mock')
const testwallet = require('../mocks/avax-wallet.json')
const sendMockData = require('../mocks/send-mocks')

// Set default environment variables for unit tests.
if (!process.env.TEST) process.env.TEST = 'unit'

describe('#burn-tokens', () => {
  let uut // unit under test
  let sandbox
  let mockData
  let mockedWallet

  before(() => {
    testUtil.restoreAvaxWallet()
  })

  beforeEach(() => {
    mockedWallet = cloneDeep(testwallet) // Clone the testwallet
    mockData = cloneDeep(sendMockData)
    sandbox = sinon.createSandbox()
    uut = new BurnTokens()

    delete require.cache[require.resolve('../../wallets/test123')]
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#validateFlags', () => {
    it('should throw error if name is not supplied.', () => {
      try {
        uut.validateFlags({})
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
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a quantity of tokens with the -q flag',
          'Expected error message.'
        )
      }
    })

    it('should throw error if token ID is not supplied.', () => {
      try {
        const flags = {
          name: 'testwallet',
          qty: 0.1
        }

        uut.validateFlags(flags)
      } catch (err) {
        assert.include(
          err.message,
          'You must specifcy the SLP token ID',
          'Expected error message.'
        )
      }
    })

    it('should return true if all flags are supplied.', () => {
      const flags = {
        name: 'testwallet',
        qty: 1.5,
        tokenId: 'c4b0d62156b3fa5c8f3436079b5394f7edc1bef5dc1cd2f9d0c4d46f82cca479'
      }
      const result = uut.validateFlags(flags)
      assert.equal(result, true)
    })
  })

  describe('#burnTokens', () => {
    it('should generate a tx to burn tokens', async () => {
      try {
        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 2 })

        const tokenId = avaxMockData.quikString
        const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[2]
        avaxUtxo.hdIndex = 1
        const tokenUtxos = uut.sendTokens.getTokenUtxos(tokenId, mockedWallet)
        const changeAddress = mockedWallet.addresses['0']

        const signed = await uut.burnTokens(
          avaxUtxo,
          tokenUtxos,
          2,
          changeAddress,
          mockedWallet,
          ''
        )

        assert.equal(signed._typeName, 'Tx', 'Tx Expected')
      } catch (error) {
        console.log(error)
        assert.fail('Unexpected Result')
      }
    })

    // since all the avax amount will be used to pay the tx and the all tokens will be burned
    it('should return a tx with no outputs', async () => {
      try {
        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 2 })
        const tokenId = avaxMockData.quikString
        const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[2]
        avaxUtxo.hdIndex = 1
        const tokenUtxos = uut.sendTokens.getTokenUtxos(tokenId, mockedWallet)
        const changeAddress = mockedWallet.addresses['0']

        const signed = await uut.burnTokens(
          { ...avaxUtxo, amount: 1000000 },
          tokenUtxos,
          4.9,
          changeAddress,
          mockedWallet,
          ''
        )

        assert.equal(signed._typeName, 'Tx', 'Tx Expected')
        const outs = signed.getUnsignedTx().getTransaction().getOuts()
        assert.equal(outs.length, 0, 'No output expected')
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result')
      }
    })

    it('should throw error if there are no token utxos', async () => {
      try {
        const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[2]
        avaxUtxo.hdIndex = 1
        const changeAddress = mockedWallet.addresses['0']

        await uut.burnTokens(
          avaxUtxo,
          null,
          2,
          changeAddress,
          mockedWallet,
          ''
        )
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(err.message, 'At least one utxo with tokens must be provided')
      }
    })

    it('should throw error if there isnt enough avax to pay for tx', async () => {
      try {
        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

        const tokenId = avaxMockData.quikString
        const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[2]
        avaxUtxo.hdIndex = 1
        const tokenUtxos = uut.sendTokens.getTokenUtxos(tokenId, mockedWallet)
        const changeAddress = mockedWallet.addresses['0']

        await uut.burnTokens(
          { ...avaxUtxo, amount: 0 },
          tokenUtxos,
          2,
          changeAddress,
          mockedWallet,
          ''
        )
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(err.message, 'Not enough avax in the selected utxo')
      }
    })

    it('should throw error if the burn amount is higher than hold amount', async () => {
      try {
        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 2 })

        const tokenId = avaxMockData.quikString
        const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[2]
        avaxUtxo.hdIndex = 1
        const tokenUtxos = uut.sendTokens.getTokenUtxos(tokenId, mockedWallet)
        const changeAddress = mockedWallet.addresses['0']

        await uut.burnTokens(
          avaxUtxo,
          tokenUtxos,
          5,
          changeAddress,
          mockedWallet,
          ''
        )
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(err.message, 'Not enough tokens in the selected utxos')
      }
    })
  })

  describe('#run', () => {
    it('should run the run() function', async () => {
      try {
        const flags = {
          name: 'test123',
          qty: 1,
          tokenId: avaxMockData.quikString
        }
        sandbox.stub(uut, 'parse').returns({ flags: flags })
        sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)

        const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[2]
        avaxUtxo.hdIndex = 1

        sandbox.stub(uut.send, 'selectUTXO').resolves(avaxUtxo)

        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 2 })

        sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves('abc123')

        const res = await uut.run(flags)
        assert.equal(res, 'abc123')
      } catch (error) {
        assert.fail('Unexpected result')
      }
    })

    it('should catch an error and return 0', async () => {
      try {
        const flags = {
          name: 'test123',
          qty: 1,
          tokenId: avaxMockData.quikString,
          memo: 'some memo'
        }
        sandbox.stub(uut, 'parse').returns({ flags: flags })
        sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)

        const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[2]
        avaxUtxo.hdIndex = 1
        avaxUtxo.amount = 0

        sandbox.stub(uut.send, 'selectUTXO').resolves(avaxUtxo)

        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
        sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 2 })

        sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves('abc123')

        const res = await uut.run(flags)
        assert.equal(res, 0)
      } catch (error) {
        assert.fail('Unexpected result')
      }
    })
  })
})
