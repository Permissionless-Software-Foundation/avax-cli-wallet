'use strict'

const assert = require('chai').assert
const sinon = require('sinon')
const cloneDeep = require('lodash.clonedeep')

// Library under test.
const CreateToken = require('../../src/commands/create-token')

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

describe('#create-tokens', () => {
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
    uut = new CreateToken()

    delete require.cache[require.resolve('../../wallets/test123')]
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#validateFlags', () => {
    it('should throw error if name is not supplied', () => {
      try {
        const flags = {}

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a wallet with the -n flag',
          'Expected error message.'
        )
      }
    })

    it('should throw error if token name is not supplied', () => {
      try {
        const flags = {
          name: 'test123'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a token name with the -t flag',
          'Expected error message.'
        )
      }
    })

    it('should throw error if ticker symbol is not supplied or invalid', () => {
      try {
        const flags = {
          name: 'test123',
          token: 'native Token'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a ticker symbol with the -s flag',
          'Expected error message.'
        )
      }
    })

    it('should throw error if token denomination is negative or over the limit', () => {
      try {
        const flags = {
          name: 'test123',
          token: 'native Token',
          symbol: 'ANT',
          denomination: 33
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a token denomination with the -d flag',
          'Expected error message.'
        )
      }
    })

    it('should throw error if the initial amount is negative', () => {
      try {
        const flags = {
          name: 'test123',
          token: 'native Token',
          symbol: 'ANT',
          denomination: 9,
          initial: -1
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify an initial minting quantity with the -q flag',
          'Expected error message.'
        )
      }
    })

    it('should throw error if receiving address is not valid.', () => {
      try {
        const flags = {
          name: 'test123',
          token: 'native Token',
          symbol: 'ANT',
          denomination: 9,
          initial: 100,
          sendAddr: 'abc'
        }

        uut.validateFlags(flags)
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'You must specify a valid avalanche',
          'Expected error message.'
        )
      }
    })

    it('should return true if all flags are supplied.', () => {
      const flags = {
        name: 'test123',
        token: 'native Token',
        symbol: 'ANT',
        denomination: 9,
        initial: 100,
        sendAddr: 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
      }

      const result = uut.validateFlags(flags)

      assert.equal(result, true)
    })
  })

  describe('#createToken', () => {
    it('should throw an error if the avaxUtxo doesnt have enough for fee', async () => {
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

      const sendToAddr = 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
      const changeAddr = mockedWallet.addresses['0']
      const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[0]
      avaxUtxo.hdIndex = 1
      avaxUtxo.amount = 0

      const tokenInfo = {
        token: 'native Token',
        memo: '',
        symbol: 'ANT',
        denomination: 9,
        initial: 100
      }

      try {
        await uut.createToken(
          mockedWallet,
          avaxUtxo,
          changeAddr,
          sendToAddr,
          tokenInfo
        )
        assert.fail('Unexpected result')
      } catch (err) {
        assert.include(
          err.message,
          'Not avax to pay the transaction fees',
          'Expected error message.'
        )
      }
    })

    it('should return a create token transaction object', async () => {
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

      const sendToAddr = 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
      const changeAddr = mockedWallet.addresses['0']
      const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[0]
      avaxUtxo.hdIndex = 1
      avaxUtxo.amount = 10000000

      const tokenInfo = {
        token: 'native Token',
        memo: '',
        symbol: 'ANT',
        denomination: 9,
        initial: 100
      }

      try {
        try {
          const signed = await uut.createToken(
            mockedWallet,
            avaxUtxo,
            changeAddr,
            sendToAddr,
            tokenInfo
          )

          const unsigned = signed.getUnsignedTx()
          const tx = unsigned.getTransaction()
          const outs = tx.getOuts()

          assert.equal(signed.getTypeName(), 'Tx', 'Tx Expected')
          assert.equal(outs.length, 0, 'Only one output with the remainder expected')
        } catch (err) {
          console.log(err)
          assert.fail('Unexpected result')
        }
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result')
      }
    })

    it('should return a create token transaction object with remaining balance', async () => {
      sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

      const sendToAddr = 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
      const changeAddr = mockedWallet.addresses['0']
      const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[0]
      avaxUtxo.hdIndex = 1
      avaxUtxo.amount = 100000000

      const tokenInfo = {
        token: 'native Token',
        memo: '',
        symbol: 'ANT',
        denomination: 9,
        initial: 100
      }

      try {
        const signed = await uut.createToken(
          mockedWallet,
          avaxUtxo,
          changeAddr,
          sendToAddr,
          tokenInfo
        )

        const unsigned = signed.getUnsignedTx()
        const tx = unsigned.getTransaction()
        const outs = tx.getOuts()
        const initialState = tx.getInitialStates()

        assert.equal(signed.getTypeName(), 'Tx', 'Tx Expected')
        assert.isTrue(Boolean(initialState), 'Expected initial state to be a non-null value')
        assert.equal(outs.length, 1, 'Only one output with the remainder expected')
      } catch (err) {
        console.log(err)
        assert.fail('Unexpected result')
      }
    })
  })

  describe('#run', () => {
    it('should throw error if theres no utxo to pay the fee', async () => {
      testUtil.restoreAvaxWallet()
      const flags = {
        name: 'test123',
        token: 'native Token',
        symbol: 'ANT',
        memo: '',
        denomination: 9,
        initial: 100,
        sendAddr: 'X-avax1xasw9kra42luktrckgc8z3hsgzme7h4ck6r4s9'
      }

      sandbox.stub(uut, 'parse').returns({ flags })
      sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)
      sandbox.stub(uut.send, 'selectUTXO').resolves({})

      const rest = await uut.run()
      assert.equal(rest, 0, 'Unexpected result')
    })

    it('should return the txid for a new transaction', async () => {
      testUtil.restoreAvaxWallet()
      try {
        const flags = {
          name: 'test123',
          token: 'native Token',
          symbol: 'ANT',
          denomination: 9,
          initial: 100,
          sendAddr: ''
        }

        const avaxUtxo = mockedWallet.avaxUtxos[0].utxos[2]
        avaxUtxo.hdIndex = 1

        sandbox.stub(uut.send, 'selectUTXO').resolves(avaxUtxo)

        sandbox.stub(uut, 'parse').returns({ flags })
        sandbox.stub(uut.updateBalances, 'updateBalances').resolves(mockedWallet)
        sandbox.stub(uut.appUtils, 'broadcastAvaxTx').resolves('anewtxid')

        sandbox.stub(uut.xchain, 'getAVAXAssetID').resolves(mockData.avaxID)

        const txid = await uut.run()
        assert.equal(txid, 'anewtxid', 'Expected txid')
      } catch (error) {
        console.log(error.message)
        assert.fail('Unexpected result')
      }
    })
  })
})
