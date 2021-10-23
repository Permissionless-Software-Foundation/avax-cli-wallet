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
})
