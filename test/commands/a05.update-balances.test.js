'use strict'

// Public NPM libraries.
const assert = require('chai').assert
const sinon = require('sinon')
const cloneDeep = require('lodash.clonedeep')

// Local libraries.
// const config = require('../../config')
const testUtil = require('../util/test-util')

// File to be tested.
const UpdateBalances = require('../../src/commands/update-balances')

// Mock data
// const uutMocks = require('../mocks/update-balance-mocks')
const avalancheMock = require('../mocks/avax-mock')

// Inspect utility used for debugging.
const util = require('util')
util.inspect.defaultOptions = {
  showHidden: true,
  colors: true,
  depth: 1
}

// Set default environment variables for unit tests.
if (!process.env.TEST) process.env.TEST = 'unit'

describe('#update-balances.js', () => {
  // let mockedWallet
  // const filename = `${__dirname}/../../wallets/test123.json`
  /** @type {UpdateBalances} */
  let uut
  let sandbox
  let mockData

  before(() => {
    testUtil.restoreAvaxWallet()
  })

  beforeEach(() => {
    uut = new UpdateBalances()
    mockData = cloneDeep(avalancheMock)
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#validateFlags()', () => {
    it('validateFlags() should return true if name is supplied.', () => {
      assert.equal(
        uut.validateFlags({ name: 'test' }),
        true,
        'return true'
      )
    })

    it('validateFlags() should throw error if name is not supplied.', () => {
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
  })

  describe('#updateBalances', () => {
    // Only run this test as an integration test.
    // DANGER! Due to the mocking used in unit tests, this test will never end.
    it('should update balances', async () => {
      sandbox.stub(uut.xchain, 'getAllBalances').resolves(mockData.assets)
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

      const callback = sandbox.stub(uut.xchain, 'getAssetDescription')
      callback.onCall(0).resolves(mockData.assetDetails[0])
      callback.onCall(1).resolves(mockData.assetDetails[1])
      callback.resolves(mockData.assetDetails[2])

      const flags = { name: 'test123' }

      const walletInfo = await uut.updateBalances(flags)

      assert.hasAllKeys(walletInfo, [
        'network',
        'type',
        'seed',
        'mnemonic',
        'privateKey',
        'addressString',
        'description',
        'assets',
        'avaxAmount'
      ])

      assert.isArray(
        walletInfo.assets,
        'Expect array of addresses with balances.'
      )

      assert.equal(walletInfo.assets.length, 3)
    })

    it('should update balances ignoring all tokens but avax', async () => {
      sandbox.stub(uut.xchain, 'getAllBalances').resolves(mockData.assets)
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

      sandbox.stub(uut.xchain, 'getAssetDescription').resolves(mockData.assetDetails[0])

      const flags = { name: 'test123', ignoreTokens: true }

      const walletInfo = await uut.updateBalances(flags)

      assert.hasAllKeys(walletInfo, [
        'network',
        'type',
        'seed',
        'mnemonic',
        'privateKey',
        'addressString',
        'description',
        'assets',
        'avaxAmount'
      ])

      assert.isArray(
        walletInfo.assets,
        'Expect array of addresses with balances.'
      )
      assert.equal(walletInfo.avaxAmount, 0.058)
      assert.equal(walletInfo.assets.length, 0)
    })

    it('should update balances even if the wallet is empty', async () => {
      sandbox.stub(uut.xchain, 'getAllBalances').resolves([])

      const flags = { name: 'test123' }

      const walletInfo = await uut.updateBalances(flags)
      assert.hasAllKeys(walletInfo, [
        'network',
        'type',
        'seed',
        'mnemonic',
        'privateKey',
        'addressString',
        'description',
        'assets',
        'avaxAmount'
      ])

      assert.isArray(
        walletInfo.assets,
        'Expect array of addresses with balances.'
      )
      assert.equal(walletInfo.avaxAmount, 0)
      assert.equal(walletInfo.assets.length, 0)
    })
  })

  describe('#run()', () => {
    it('should run the run() function', async () => {
      const flags = { name: 'test123' }
      // Mock methods that will be tested elsewhere.
      sandbox.stub(uut, 'parse').returns({ flags })
      sandbox.stub(uut.xchain, 'getAllBalances').resolves(mockData.assets)
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

      const callback = sandbox.stub(uut.xchain, 'getAssetDescription')
      callback.onCall(0).resolves(mockData.assetDetails[0])
      callback.onCall(1).resolves(mockData.assetDetails[1])
      callback.resolves(mockData.assetDetails[2])

      const walletInfo = await uut.run()

      assert.equal(walletInfo.network, 'mainnet', 'Expecting mainnet address')
      assert.hasAllKeys(walletInfo, [
        'network',
        'type',
        'seed',
        'mnemonic',
        'privateKey',
        'addressString',
        'description',
        'assets',
        'avaxAmount'
      ])
    })

    it('should return 0 and display error.message on empty flags', async () => {
      sandbox.stub(uut, 'parse').returns({ flags: {} })

      const result = await uut.run()

      assert.equal(result, 0)
    })
  })
})
