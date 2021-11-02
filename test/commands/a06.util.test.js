/*
  TODO:
*/

'use strict'

const assert = require('chai').assert
const sinon = require('sinon')
const mock = require('mock-fs')

// File under test.
const AppUtils = require('../../src/util')

// Mocking data
const utilMocks = require('../mocks/util')
const testwallet = require('../mocks/avax-wallet.json')
const avaxMock = require('../mocks/avax-mock')

// Set default environment variables for unit tests.
if (!process.env.TEST) process.env.TEST = 'unit'

describe('#util.js', () => {
  let appUtils
  let sandbox

  beforeEach(() => {
    appUtils = new AppUtils()

    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#openWallet', () => {
    it('should throw error if wallet file not found.', () => {
      try {
        appUtils.openWallet('doesnotexist')
      } catch (err) {
        assert.include(err.message, 'Could not open', 'Expected error message.')
      }
    })
  })

  describe('#saveWallet', () => {
    it('should save a wallet without error', async () => {
      const filename = `${__dirname}/../../wallets/test123.json`

      await appUtils.saveWallet(filename, utilMocks.mockWallet)
    })
    it('should throw error on file write problems', async () => {
      mock()
      try {
        await appUtils.saveWallet(null, utilMocks.mockWallet)
        assert.equal(true, false, 'Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'The "path" argument must be of type string'
        )
      }
      mock.restore()
    })
  })

  describe('#sleep', () => {
    it('should return promise', async () => {
      await appUtils.sleep(10)
      assert.equal(true, true)
    })
  })

  describe('#broadcastAvaxTx', () => {
    it('should return the txid', async () => {
      sandbox.stub(appUtils.xchain, 'issueTx').resolves('txid')

      const txid = await appUtils.broadcastAvaxTx('sometx')
      assert.equal(txid, 'txid')
    })

    it('should return the txid', async () => {
      try {
        sandbox.stub(appUtils.xchain, 'issueTx').rejects()

        await appUtils.broadcastAvaxTx('sometx')
        assert.fail('Unexpected result')
      } catch (error) {
        assert(true)
      }
    })
  })

  describe('#avalancheChangeAddress', () => {
    it('should throw error if the given index is lesser than 0', async () => {
      try {
        await appUtils.avalancheChangeAddress(10)
        assert.fail('Unexpected result')
      } catch (error) {
        assert.include(
          error.message,
          'index must be a non-negative integer',
          'Expected error message'
        )
      }
    })
  })

  describe('#encodeUtxo', () => {
    it('should return an AVM UTXO object', async () => {
      const [utxoJSON] = testwallet.avaxUtxos[0].utxos
      const address = testwallet.avaxUtxos[0].address

      const utxo = appUtils.encodeUtxo(utxoJSON, address)
      assert.equal(utxo.getTypeName(), 'TransferableInput')
      const txid = appUtils.bintools.cb58Encode(utxo.getTxID())
      assert.equal(txid, utxoJSON.txid)
    })
  })

  describe('#generateOutput', () => {
    it('should return an AVM SECPTransferOutput object', async () => {
      const address = testwallet.avaxUtxos[0].address
      const addressBuffer = appUtils.ava.XChain().parseAddress(address)
      const assetID = '2tEi6r6PZ9VXHogUmkCzvijmW81TRNjtKWnR4FA55zTPc87fxC'
      const assetBuffer = appUtils.bintools.cb58Decode(assetID)

      const output = appUtils.generateOutput(
        new appUtils.BN(1000),
        addressBuffer,
        assetBuffer
      )
      assert.equal(output.getTypeName(), 'TransferableOutput')
      const outputAsset = appUtils.bintools.cb58Encode(output.getAssetID())
      assert.equal(outputAsset, assetID)
    })
  })

  describe('#readTx', () => {
    it('should return a JSON with the transaction inputs and outputs', async () => {
      const { hex } = avaxMock.aliceTx
      const tx = appUtils.readTx(hex)

      assert.hasAllKeys(tx, ['typeName', 'inputs', 'outputs'])
      assert.isArray(tx.inputs)
      assert.isArray(tx.outputs)
      assert.isString(tx.typeName)
    })
  })
})
