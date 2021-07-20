/*
  TODO:
*/

'use strict'

const assert = require('chai').assert
const sinon = require('sinon')
const cloneDeep = require('lodash.clonedeep')

const GetKey = require('../../src/commands/get-key')

const testUtil = require('../util/test-util')
const avalancheMock = require('../mocks/avax-mock')

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

describe('get-key', () => {
  let getKey
  let sandbox
  let mockData

  before(() => {
    testUtil.restoreAvaxWallet()
  })

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    getKey = new GetKey()
    mockData = cloneDeep(avalancheMock)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#run()', () => {
    it('should run the function', async () => {
      const flags = { name: 'test123' }
      // Mock methods that will be tested elsewhere.
      sandbox.stub(getKey, 'parse').returns({ flags: flags })
      sandbox.stub(getKey.qrcode, 'generate').returns(true)
      sandbox.stub(getKey, 'log').returns(true)

      const result = await getKey.run()
      assert.include(result.priv, 'PrivateKey-')
      assert.include(result.pub, 'X-')
    })

    it('run(): should return 0 and display error.message on empty flags', async () => {
      sandbox.stub(getKey, 'parse').returns({ flags: {} })

      const result = await getKey.run()
      assert.equal(result, null)
    })

    it('run(): should handle an error without a message', async () => {
      sandbox.stub(getKey, 'parse').throws({})

      const result = await getKey.run()
      assert.equal(result, null)
    })
  })

  describe('#getKeyPair()', () => {
    // getKey can be called directly by other programs, so this is tested separately.
    it('should throw error if name is not supplied.', async () => {
      try {
        await getKey.getKeyPair(undefined)
        assert.fail('unexpected result')
      } catch (err) {
        assert.include(err.message, 'Could not open', 'Expected error message.')
      }
    })

    it('should return a key pair for the address at the first index', async () => {
      try {
        const res = await getKey.getKeyPair(filename, 0)

        assert.hasAllKeys(res, ['priv', 'pub', 'pubHex'])
        assert.equal(res.priv, mockData.keys[0].priv)
        assert.equal(res.pub, mockData.keys[0].pub)
        assert.equal(res.pubHex, mockData.keys[0].pubHex)
      } catch (err) {
        console.log(err)
        assert.fail('unexpected result')
      }
    })

    it('should return a key pair for the address at the next index', async () => {
      try {
        const res = await getKey.getKeyPair(filename)

        assert.hasAllKeys(res, ['priv', 'pub', 'pubHex'])
        assert.equal(res.priv, mockData.keys[1].priv)
        assert.equal(res.pub, mockData.keys[1].pub)
        assert.equal(res.pubHex, mockData.keys[1].pubHex)
      } catch (err) {
        console.log(err)
        assert.fail('unexpected result')
      }
    })
  })

  describe('#validateFlags()', () => {
    it('validateFlags() should throw error if name is not supplied.', () => {
      try {
        getKey.validateFlags({})
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a wallet with the -n flag',
          'Expected error message.'
        )
      }
    })

    it('should return on proper flags passed', () => {
      assert.equal(
        getKey.validateFlags({ name: 'test' }),
        true,
        'return true'
      )
    })
  })
})
