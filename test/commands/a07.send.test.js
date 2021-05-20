'use strict'

const assert = require('chai').assert
const sinon = require('sinon')
const cloneDeep = require('lodash.clonedeep')

// Library under test.
const Send = require('../../src/commands/send')

// Mock data
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

describe('send', () => {
  let mockedWallet
  let uut
  let sandbox
  let mockData

  before(() => {
    testUtil.restoreAvaxWallet()
  })

  beforeEach(() => {
    mockedWallet = Object.assign({}, testwallet) // Clone the testwallet
    mockData = cloneDeep(sendMockData)
    sandbox = sinon.createSandbox()
    uut = new Send()
  })

  afterEach(() => { sandbox.restore() })

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

    it('should throw error if AVAX quantity is not supplied.', () => {
      try {
        const flags = {
          name: 'testwallet'
        }

        uut.validateFlags(flags)
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a quantity in AVAX with the -q flag.',
          'Expected error message.'
        )
      }
    })

    it('should throw error if recieving address is not supplied.', () => {
      try {
        const flags = {
          name: 'testwallet',
          avax: 0.000005
        }

        uut.validateFlags(flags)
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a send-to address with the -a flag',
          'Expected error message.'
        )
      }
    })

    it('should throw error if recieving address is not valid.', () => {
      try {
        const flags = {
          name: 'testwallet',
          avax: 0.000005,
          sendAddr: 'garysecretwallet'
        }

        uut.validateFlags(flags)
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
        avax: 0.000005,
        sendAddr: mockedWallet.addressString
      }

      const result = uut.validateFlags(flags)

      assert.equal(result, true)
    })
  })

  describe('#sendAVAX', () => {
    it('should throw an error if the given utxoSet is empty', async () => {
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
      sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 9 })
      sandbox.stub(uut.xchain, 'getUTXOs').resolves({ utxos: mockData.empty })

      const avax = 0.01 // AVAX to send in an integration test.

      const sendToAddr = mockedWallet.addressString
      try {
        await uut.sendAvax(
          avax,
          sendToAddr,
          mockedWallet,
          mockedWallet
        )

        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'There are no UTXOs in the address',
          'Expected error message.'
        )
      }
    })

    it('should throw an error if there is not enough avax', async () => {
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
      sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 9 })
      sandbox.stub(uut.xchain, 'getUTXOs').resolves({ utxos: mockData.sendUtxoSet })

      const avax = 0.06 // AVAX to send in an integration test.

      const sendToAddr = mockedWallet.addressString
      try {
        await uut.sendAvax(
          avax,
          sendToAddr,
          mockedWallet,
          mockedWallet
        )

        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'Not enough founds to pay for transaction',
          'Expected error message.'
        )
      }
    })

    it('should send AVAX to the given address', async () => {
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
      sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 9 })
      sandbox.stub(uut.xchain, 'getUTXOs').resolves({ utxos: mockData.sendUtxoSet })

      const avax = 0.01 // AVAX to send in an integration test.

      const sendToAddr = mockedWallet.addressString

      const tx = await uut.sendAvax(
        avax,
        sendToAddr,
        mockedWallet,
        mockedWallet
      )

      assert.equal(tx._typeName, 'Tx', 'Tx Expected')
    })
  })

  describe('#run()', () => {
    it('should run the run() function', async () => {
      const flags = {
        name: 'test123',
        avax: 0.000005,
        sendAddr: mockedWallet.addressString
      }
      // Mock methods that will be tested elsewhere.
      sandbox.stub(uut, 'parse').returns({ flags })
      sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)

      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
      sandbox.stub(uut.xchain, 'getAssetDescription').resolves({ denomination: 9 })
      sandbox.stub(uut.xchain, 'getUTXOs').resolves({ utxos: mockData.sendUtxoSet })

      sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves(mockData.avaxString)

      const txid = await uut.run()

      assert.equal(txid, mockData.avaxString, 'Txid Expected')
    })

    it('should throw an error for unsuficient funds', async () => {
      const flags = {
        name: 'test123',
        avax: 0.06,
        sendAddr: mockedWallet.addressString
      }
      // Mock methods that will be tested elsewhere.
      sandbox.stub(uut, 'parse').returns({ flags })
      sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)

      const txid = await uut.run()

      assert.equal(txid, 0)
    })

    it('should return 0 and display error.message on empty flags', async () => {
      sandbox.stub(uut, 'parse').returns({ flags: {} })

      const result = await uut.run()

      assert.equal(result, 0)
    })
  })
})
