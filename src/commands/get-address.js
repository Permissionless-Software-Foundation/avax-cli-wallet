/*
  Generates a new HD address for recieving assets in the avalanche blockchain.

  -The next available address is tracked by the 'nextAddress' property in the
  wallet .json file.
*/

'use strict'

const qrcode = require('qrcode-terminal')

const AppUtils = require('../util')
const appUtils = new AppUtils()

const globalConfig = require('../../config')

const HDKey = require('hdkey')
const bip39 = require('bip39')

const { Avalanche } = require('avalanche')

// Mainnet by default.
const bchjs = new globalConfig.BCHLIB({
  restURL: globalConfig.MAINNET_REST,
  apiToken: globalConfig.JWT
})

const { Command, flags } = require('@oclif/command')

// let _this

class GetAddress extends Command {
  constructor (argv, config) {
    super(argv, config)
    this.bchjs = bchjs
    this.ava = new Avalanche('api.avax.network', 443, 'https')
    this.appUtils = appUtils
    this.localConfig = globalConfig
    this.bip39 = bip39
    this.HDKey = HDKey
  }

  async run () {
    try {
      const { flags } = this.parse(GetAddress)

      // Validate input flags
      this.validateFlags(flags)

      // Generate an absolute filename from the name.
      const filename = `${__dirname}/../../wallets/${flags.name}.json`

      const newAddress = await this.getAvalancheAddress(filename, !flags.noupdate)

      // Cut down on screen spam when running unit tests.
      if (process.env.TEST !== 'unit') {
        // Display the address as a QR code.
        qrcode.generate(newAddress, { small: true })

        // Display the address to the user.
        this.log(`X-Chain address: ${newAddress}`)
      }

      return newAddress
    } catch (err) {
      if (err.message) console.log(err.message)
      else console.log('Error in GetAddress.run: ', err)

      return 0
    }
  }

  async getAddress (filename, flags) {
    // const filename = `${__dirname}/../../wallets/${name}.json`

    const walletInfo = this.appUtils.openWallet(filename)
    // console.log(`walletInfo: ${JSON.stringify(walletInfo, null, 2)}`)

    // Point to the correct rest server.
    if (walletInfo.network === 'testnet') {
      this.bchjs = new globalConfig.BCHLIB({ restURL: globalConfig.TESTNET_REST })
    } else this.bchjs = new globalConfig.BCHLIB({ restURL: globalConfig.MAINNET_REST })

    // root seed buffer
    const rootSeed = await this.bchjs.Mnemonic.toSeed(walletInfo.mnemonic)

    // master HDNode
    let masterHDNode
    if (walletInfo.network === 'testnet') {
      masterHDNode = this.bchjs.HDNode.fromSeed(rootSeed, 'testnet')
    } else masterHDNode = this.bchjs.HDNode.fromSeed(rootSeed)

    // HDNode of BIP44 account
    const account = this.bchjs.HDNode.derivePath(
      masterHDNode,
      `m/44'/${walletInfo.derivation}'/0'`
    )
    // console.log(`account: ${util.inspect(account)}`)

    // derive an external change address HDNode
    const change = this.bchjs.HDNode.derivePath(
      account,
      `0/${walletInfo.nextAddress}`
    )
    // console.log(`change: ${util.inspect(change)}`)

    // Increment to point to a new address for next time.
    walletInfo.nextAddress++

    // Update the wallet.addresses array.
    const addresses = await this.appUtils.generateAddress(
      walletInfo,
      0,
      walletInfo.nextAddress
    )
    walletInfo.addresses = []
    for (let i = 0; i < addresses.length; i++) {
      walletInfo.addresses.push([i, addresses[i]])
    }

    // Update the wallet file.
    await this.appUtils.saveWallet(filename, walletInfo)

    // get the cash address
    let newAddress = this.bchjs.HDNode.toCashAddress(change)

    // Convert to simpleledger: address if flag is set.
    if (flags && flags.token) {
      newAddress = this.bchjs.SLP.Address.toSLPAddress(newAddress)
    }

    return newAddress
  }

  async getAvalancheAddress (filename, shouldUpdate) {
    const walletInfo = this.appUtils.openWallet(filename)

    // Increment to point to a new address for next time.
    walletInfo.nextAddress++

    // Update the wallet.addresses array.
    const addresses = await this.appUtils.generateAvalancheAddress(
      walletInfo,
      0,
      walletInfo.nextAddress
    )
    walletInfo.addresses = {}
    for (let i = 0; i < addresses.length; i++) {
      walletInfo.addresses[i] = addresses[i]
    }

    // Update the wallet file.
    if (shouldUpdate) {
      await this.appUtils.saveWallet(filename, walletInfo)
    }

    // get the cash address
    const [newAddress] = addresses.slice(-1)

    return newAddress
  }

  // Validate the proper flags are passed in.
  validateFlags (flags) {
    // Exit if wallet not specified.
    const name = flags.name
    if (!name || name === '') {
      throw new Error('You must specify a wallet with the -n flag.')
    }

    return true
  }
}

GetAddress.description = 'Generate a new address to recieve funds in the XChain.'

GetAddress.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' }),
  noupdate: flags.boolean({ char: 'u', description: 'Prevent updating the wallet' })
}

module.exports = GetAddress
