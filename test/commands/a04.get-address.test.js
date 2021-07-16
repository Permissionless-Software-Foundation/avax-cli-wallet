/*
  TODO:
*/

'use strict'

const assert = require('chai').assert
const sinon = require('sinon')

const testUtil = require('../util/test-util')
const GetAddress = require('../../src/commands/get-address')

const filename = `${__dirname}/../../wallets/test123.json`

const fs = require('fs')

// Set default environment variables for unit tests.
if (!process.env.TEST) process.env.TEST = 'unit'

const deleteFile = () => {
  delete require.cache[require.resolve('../../wallets/test123')]
  const prom = new Promise((resolve, reject) => {
    fs.unlink(filename, () => {
      resolve(true)
    }) // Delete wallets file
  })
  return prom
}

describe('get-address', () => {
  let getAddress
  let sandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    getAddress = new GetAddress()

    // By default, use the mocking library instead of live calls.
    await deleteFile()
    testUtil.restoreAvaxWallet()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#getAvalancheAddress()', () => {
    it('should throw error if name is not supplied.', async () => {
      try {
        await getAddress.getAvalancheAddress(undefined)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(err.message, 'Could not open', 'Expected error message.')
      }
    })

    it('should throw error if wallet file not found', async () => {
      try {
        await getAddress.getAvalancheAddress('doesnotexist')
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(err.message, 'Could not open', 'Expected error message.')
      }
    })

    it('increments the nextAddress property of the wallet', async () => {
      const initialWalletInfo = require('../../wallets/test123')

      // Record the initial nextAddress property. This is going to be 1 for a new wallet.
      const firstAddressIndex = initialWalletInfo.nextAddress

      // Generate a new address
      await getAddress.getAvalancheAddress(filename, true)

      // Delete the cached copy of the wallet. This allows testing of list-wallets.
      delete require.cache[require.resolve('../../wallets/test123')]

      // Read in the wallet file.
      const walletInfo = require('../../wallets/test123')

      assert.equal(
        walletInfo.nextAddress,
        firstAddressIndex + 1,
        'nextAddress property should increment'
      )
    })

    it('keeps the nextAddress property of the wallet.', async () => {
      const initialWalletInfo = require('../../wallets/test123')

      // Record the initial nextAddress property. This is going to be 1 for a new wallet.
      const firstAddressIndex = initialWalletInfo.nextAddress

      // Generate a new address
      await getAddress.getAvalancheAddress(filename, false)

      // Delete the cached copy of the wallet. This allows testing of list-wallets.
      delete require.cache[require.resolve('../../wallets/test123')]

      // Read in the wallet file.
      const walletInfo = require('../../wallets/test123')

      assert.equal(
        walletInfo.nextAddress,
        firstAddressIndex,
        'nextAddress property should be kept'
      )
    })

    it('returns a avalanche cash address', async () => {
      // Generate a new address
      const addr = await getAddress.getAvalancheAddress(filename)

      const index = addr.indexOf('X-avax1')

      assert.isAbove(index, -1, 'Avalanche address')
    })
  })

  describe('#validateFlags()', () => {
    // This validation function is called when the program is executed from the command line.
    it('validateFlags() should throw error if name is not supplied.', () => {
      try {
        getAddress.validateFlags({})

        assert.fail('Unexpected result')
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
      try {
        const flags = { name: 'test123' }
        // Mock methods that will be tested elsewhere.

        sandbox.stub(getAddress, 'parse').returns({ flags: flags })
        sandbox.stub(getAddress.qrcode, 'generate').returns(true)
        sandbox.stub(getAddress, 'log').returns(true)

        const addr = await getAddress.run()
        const index = addr.indexOf('X-avax1')
        assert.isAbove(index, -1, 'Avalanche address')
      } catch (error) {
        console.log(error)
        assert.fail('unexpected result')
      }
    })

    it('should return error.message on empty flags', async () => {
      sandbox.stub(getAddress, 'parse').returns({ flags: {} })

      const result = await getAddress.run()

      assert.equal(result, 0)
    })

    it('should handle an error without a message', async () => {
      // Force error in run() function.
      sandbox.stub(getAddress, 'parse').throws({})

      const result = await getAddress.run()
      console.log('result: ', result)

      assert.equal(result, 0)
    })
  })
})
