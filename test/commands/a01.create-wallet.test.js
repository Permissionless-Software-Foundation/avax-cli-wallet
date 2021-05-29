/*
  Create wallet
*/

'use strict'

const assert = require('chai').assert
const sinon = require('sinon')
const fs = require('fs')
const CreateWallet = require('../../src/commands/create-wallet')

const { bitboxMock } = require('../mocks/bitbox')
const filename = `${__dirname}/../../wallets/test123.json`

// Inspect utility used for debugging.
const util = require('util')
util.inspect.defaultOptions = {
  showHidden: true,
  colors: true,
  depth: 1
}

// Set default environment variables for unit tests.
if (!process.env.TEST) process.env.TEST = 'unit'

// Used to delete testing wallet files.
const deleteFile = () => {
  const prom = new Promise((resolve, reject) => {
    fs.unlink(filename, () => {
      resolve(true)
    }) // Delete wallets file
  })
  return prom
}

describe('create-wallet', () => {
  let createWallet
  let sandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    createWallet = new CreateWallet()

    // By default, use the mocking library instead of live calls.
    createWallet.bchjs = bitboxMock

    await deleteFile()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#createWallet()', () => {
    it('should exit with error status if called without a filename.', async () => {
      try {
        await createWallet.createWallet(undefined, undefined)

        assert.fail('Unexpected result')
      } catch (err) {
        assert.equal(
          err.message,
          'filename required.',
          'Should throw expected error.'
        )
      }
    })

    it('Should exit with error status if called with a filename that already exists.', async () => {
      try {
        // Force the error for testing purposes.
        sandbox.stub(createWallet.fs, 'existsSync').returns(true)

        await createWallet.createWallet(filename, 'testnet')

        assert.fail('Unexpected result')
      } catch (err) {
        assert.equal(
          err.message,
          'filename already exist',
          'Should throw expected error.'
        )
      }
    })

    it('should create a mainnet wallet file with the given name', async () => {
      const walletData = await createWallet.createWallet(filename, undefined)

      assert.equal(walletData.network, 'mainnet', 'Expecting address')
      assert.hasAllKeys(walletData, [
        'network',
        'type',
        'mnemonic',
        'description',
        'balances',
        'addresses',
        'nextAddress',
        'avaxAmount'
      ])

      // assets is an array of objects. Each object represents different asset
      assert.isArray(walletData.balances)
    })
  })

  describe('#validateFlags()', () => {
    it('validateFlags() should return true if name is supplied.', () => {
      assert.equal(
        createWallet.validateFlags({ name: 'test' }),
        true,
        'return true'
      )
    })

    it('validateFlags() should throw error if name is not supplied.', () => {
      try {
        createWallet.validateFlags({})
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a wallet with the -n flag',
          'Expected error message.'
        )
      }
    })
  })

  describe('#run()', () => {
    it('should run the run() function', async () => {
      const flags = {
        name: 'test123'
      }
      // Mock methods that will be tested elsewhere.
      sandbox.stub(createWallet, 'parse').returns({ flags })

      const walletData = await createWallet.run()

      assert.equal(walletData.network, 'mainnet', 'Expecting mainnet address')
      assert.hasAllKeys(walletData, [
        'network',
        'type',
        'mnemonic',
        'description',
        'balances',
        'addresses',
        'nextAddress',
        'avaxAmount'
      ])
    })

    it('should run the run() function and add a description', async () => {
      const flags = {
        name: 'test123',
        description: 'test address'
      }
      // Mock methods that will be tested elsewhere.
      sandbox.stub(createWallet, 'parse').returns({ flags })

      const walletData = await createWallet.run()

      assert.equal(walletData.network, 'mainnet', 'Expecting mainnet address')
      assert.equal(walletData.description, flags.description, 'Expecting equal description')
      assert.hasAllKeys(walletData, [
        'network',
        'type',
        'mnemonic',
        'description',
        'balances',
        'addresses',
        'nextAddress',
        'avaxAmount'
      ])
    })

    it('should return 0 and display error.message on empty flags', async () => {
      sandbox.stub(createWallet, 'parse').returns({ flags: {} })

      const result = await createWallet.run()

      assert.equal(result, 0)
    })
  })
})
