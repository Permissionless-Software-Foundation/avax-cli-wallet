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

  describe('#getAddressBalances', () => {
    it('should return all the balances in the given address', async () => {
      sandbox.stub(uut.xchain, 'getAllBalances').resolves(mockData.assets)
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

      const callback = sandbox.stub(uut.xchain, 'getAssetDescription')
      callback.onCall(0).resolves(mockData.assetDetails[1])
      callback.resolves(mockData.assetDetails[2])

      const initialWalletInfo = require('../../wallets/test123')
      const walletInfo = await uut.getAddressBalances(
        initialWalletInfo.addresses[0],
        mockData.assetDetails[0],
        0
      )

      assert.hasAllKeys(walletInfo, [
        'address',
        'hdIndex',
        'avaxAmount',
        'assets'
      ])

      assert.isArray(
        walletInfo.assets,
        'Expect array of addresses with balances.'
      )
      assert.equal(walletInfo.hdIndex, 0)
      assert.equal(walletInfo.assets.length, 3)
    })

    it('should fetch the avax description if its not provided', async () => {
      sandbox.stub(uut.xchain, 'getAllBalances').resolves(mockData.assets)
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

      const callback = sandbox.stub(uut.xchain, 'getAssetDescription')
      callback.onCall(0).resolves(mockData.assetDetails[0])
      callback.onCall(1).resolves(mockData.assetDetails[1])
      callback.resolves(mockData.assetDetails[2])

      const initialWalletInfo = require('../../wallets/test123')
      const walletInfo = await uut.getAddressBalances(
        initialWalletInfo.addresses[0],
        null,
        0
      )

      assert.hasAllKeys(walletInfo, [
        'address',
        'hdIndex',
        'avaxAmount',
        'assets'
      ])

      assert.isArray(
        walletInfo.assets,
        'Expect array of addresses with balances.'
      )
      assert.equal(walletInfo.hdIndex, 0)
      assert.equal(walletInfo.assets.length, 3)
    })

    it('should throw an error', async () => {
      try {
        sandbox.stub(uut.xchain, 'getAllBalances').rejects()

        const initialWalletInfo = require('../../wallets/test123')
        await uut.getAddressBalances(
          initialWalletInfo.addresses[0],
          mockData.assetDetails[0],
          0
        )
        assert.fail('Unexpected result')
      } catch (error) {
        assert(true)
      }
    })
  })

  describe('#filterUtxos', () => {
    it('should throw an error if utxo array is not provided', async () => {
      try {
        uut.filterUtxos()
        assert.fail('Unexpected result')
      } catch (error) {
        assert.include(error.message, 'utxoObjs must be an array')
      }
    })

    it('should throw an error if avaxHex is not a string', async () => {
      try {
        uut.filterUtxos([])
        assert.fail('Unexpected result')
      } catch (error) {
        assert.include(error.message, 'avaxHex must be a string')
      }
    })

    it('should return the filtered utxos', async () => {
      try {
        const walletInfo = require('../../wallets/test123')

        const utxosObjs = [
          { address: walletInfo.addresses['0'], hdIndex: 0, utxos: [] },
          { address: walletInfo.addresses['1'], hdIndex: 1, utxos: mockData.utxos }
        ]

        const res = uut.filterUtxos(utxosObjs, mockData.avaxID.toString('hex'))
        assert.hasAllKeys(res, [
          'avaxUtxos',
          'otherUtxos'
        ])

        // return only one since the first address doesnt have any utxo
        assert.equal(res.avaxUtxos.length, 1)
        assert.equal(res.otherUtxos.length, 1)
      } catch (error) {
        assert.fail('Unexpected result')
      }
    })
  })

  describe('#getAddressData', () => {
    it('should throw an error if index is not suplied', async () => {
      try {
        const initialWalletInfo = require('../../wallets/test123')
        await uut.getAddressData(initialWalletInfo)
        assert.fail('Unexpected result')
      } catch (error) {
        assert.include(error.message, 'index must be supplied')
      }
    })

    it('should throw an error if limit is not suplied', async () => {
      try {
        const initialWalletInfo = require('../../wallets/test123')
        await uut.getAddressData(initialWalletInfo, 0)
        assert.fail('Unexpected result')
      } catch (error) {
        assert.include(error.message, 'limit must be supplied as a non-zero number')
      }
    })

    it('should throw an error if limit is over 20', async () => {
      try {
        const initialWalletInfo = require('../../wallets/test123')
        await uut.getAddressData(initialWalletInfo, 0, 25)
        assert.fail('Unexpected result')
      } catch (error) {
        assert.include(error.message, 'limit must be 20 or less.')
      }
    })

    it('should update balances', async () => {
      const assetDescription = sandbox.stub(uut.xchain, 'getAssetDescription')
      const allBalances = sandbox.stub(uut.xchain, 'getAllBalances')
      const getUTXOs = sandbox.stub(uut.xchain, 'getUTXOs')

      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
      assetDescription.onCall(0).resolves(mockData.assetDetails[0])

      allBalances.onCall(0).resolves([]) // first address is empty
      allBalances.onCall(1).resolves(mockData.assets) // second address does have utxos
      allBalances.resolves([])

      assetDescription.onCall(1).resolves(mockData.assetDetails[1])
      assetDescription.resolves(mockData.assetDetails[2])

      getUTXOs.onCall(0).resolves({ utxos: mockData.utxoSet })
      getUTXOs.resolves({ utxos: mockData.emptyUtxoSet })

      const initialWalletInfo = require('../../wallets/test123')

      const addressData = await uut.getAddressData(initialWalletInfo, 0, 20)

      assert.hasAllKeys(addressData, [
        'balances',
        'avaxUtxos',
        'otherUtxos',
        'avaxAmount'
      ])

      assert.isArray(addressData.avaxUtxos, 'Expect array of addresses with balances.')
      assert.isArray(addressData.otherUtxos, 'Expect array of addresses with balances.')
    })
  })

  describe('#getAllAddressData', () => {
    it('should fetch the balances of at least 20 addresses', async () => {
      const assetDescription = sandbox.stub(uut.xchain, 'getAssetDescription')
      const allBalances = sandbox.stub(uut.xchain, 'getAllBalances')
      const getUTXOs = sandbox.stub(uut.xchain, 'getUTXOs')

      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
      assetDescription.onCall(0).resolves(mockData.assetDetails[0])

      allBalances.onCall(0).resolves([]) // first address is empty
      allBalances.onCall(1).resolves(mockData.assets) // second address does have utxos
      allBalances.resolves([])

      assetDescription.onCall(1).resolves(mockData.assetDetails[1])
      assetDescription.resolves(mockData.assetDetails[2])

      getUTXOs.onCall(0).resolves({ utxos: mockData.utxoSet })
      getUTXOs.resolves({ utxos: mockData.emptyUtxoSet })

      const initialWalletInfo = require('../../wallets/test123')

      const addressData = await uut.getAllAddressData(initialWalletInfo)

      assert.hasAllKeys(addressData, [
        'balances',
        'avaxUtxos',
        'otherUtxos',
        'avaxAmount'
      ])

      assert.isArray(addressData.avaxUtxos, 'Expect array of addresses with balances.')
      assert.isArray(addressData.otherUtxos, 'Expect array of addresses with balances.')
    })

    it('should throw an error', async () => {
      try {
        sandbox.stub(uut, 'getAddressData').rejects(new Error('intended error'))
        const initialWalletInfo = require('../../wallets/test123')

        await uut.getAllAddressData(initialWalletInfo)
        assert.fail('Unexpected result')
      } catch (error) {
        assert.include(error.message, 'intended error')
      }
    })
  })

  describe('#run()', () => {
    it('should run the run() function', async () => {
      const flags = { name: 'test123' }
      // Mock methods that will be tested elsewhere.
      sandbox.stub(uut, 'parse').returns({ flags })
      const assetDescription = sandbox.stub(uut.xchain, 'getAssetDescription')
      const allBalances = sandbox.stub(uut.xchain, 'getAllBalances')
      const getUTXOs = sandbox.stub(uut.xchain, 'getUTXOs')

      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)
      assetDescription.onCall(0).resolves(mockData.assetDetails[0])

      allBalances.onCall(0).resolves([]) // first address is empty
      allBalances.onCall(1).resolves(mockData.assets) // second address does have utxos
      allBalances.resolves([])

      assetDescription.onCall(1).resolves(mockData.assetDetails[1])
      assetDescription.resolves(mockData.assetDetails[2])

      getUTXOs.onCall(0).resolves({ utxos: mockData.utxoSet })
      getUTXOs.resolves({ utxos: mockData.emptyUtxoSet })

      const walletInfo = await uut.run()

      assert.equal(walletInfo.network, 'mainnet', 'Expecting mainnet address')
      assert.hasAllKeys(walletInfo, [
        'network',
        'type',
        'mnemonic',
        'description',
        'addresses',
        'nextAddress',
        'avaxAmount',
        'balances',
        'avaxUtxos',
        'otherUtxos'
      ])
    })

    it('should return 0 and display error.message on empty flags', async () => {
      sandbox.stub(uut, 'parse').returns({ flags: {} })

      const result = await uut.run()

      assert.equal(result, 0)
    })
  })
})
