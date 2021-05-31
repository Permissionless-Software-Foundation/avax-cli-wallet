'use strict'

// const { expect, test } = require("@oclif/test")
const assert = require('chai').assert
const testUtil = require('../util/test-util')
const ListWallets = require('../../src/commands/list-wallets')
const filename = `${__dirname}/../../wallets/test123.json`
const fs = require('fs')
const mock = require('mock-fs')

// Set default environment variables for unit tests.
if (!process.env.TEST) process.env.TEST = 'unit'
const deleteFile = () => {
  const prom = new Promise((resolve, reject) => {
    fs.unlink(filename, () => {
      resolve(true)
    }) // Delete wallets file
  })
  return prom
}
describe('list-wallets', () => {
  // let listWallets

  beforeEach(async () => {
    await deleteFile()
  })

  it('should correctly identify a mainnet wallet', async () => {
    // Create a mainnet wallet.

    testUtil.restoreAvaxWallet()

    const listWallets = new ListWallets()
    const data = listWallets.parseWallets()

    // Find the wallet that was just created.
    const testWallet = data.find(wallet => wallet[0].indexOf('test123') > -1)

    const network = testWallet[1]
    assert.equal(network, 'mainnet', 'Correct network detected.')
  })

  it('should correctly identify a testnet wallet', async () => {
    // Create a testnet wallet
    testUtil.restoreWallet('testnet')

    const listWallets = new ListWallets()
    const data = listWallets.parseWallets()

    // Find the wallet that was just created.
    const testWallet = data.find(wallet => wallet[0].indexOf('test123') > -1)

    const network = testWallet[1]
    assert.equal(network, 'testnet', 'Correct network detected.')
  })

  it('should display wallets table', async () => {
    testUtil.restoreAvaxWallet()

    const listWallets = new ListWallets()
    Promise.resolve(listWallets.run()).then(function (table) {
      assert.include(table, 'Name')
      assert.include(table, 'Network')
      assert.include(table, 'Balance (AVAX)')
    })
  })

  it('should return empty array on missing wallets data', async () => {
    testUtil.restoreWallet('testnet')

    const listWallets = new ListWallets()
    // simulate no files found
    mock({})
    let data
    try {
      data = listWallets.parseWallets()
    } catch (error) {
      assert.equal(data, [], 'Empty array')
      assert.equal(error, 'No wallets found.', 'Proper error message')
    }
    mock.restore()
  })
})
