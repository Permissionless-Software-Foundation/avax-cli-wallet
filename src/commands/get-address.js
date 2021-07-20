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

const { Command, flags } = require('@oclif/command')

// let _this

class GetAddress extends Command {
  constructor (argv, config) {
    super(argv, config)
    this.ava = new Avalanche('api.avax.network', 443, 'https')
    this.appUtils = appUtils
    this.localConfig = globalConfig
    this.bip39 = bip39
    this.HDKey = HDKey
    this.qrcode = qrcode
  }

  async run () {
    try {
      const { flags } = this.parse(GetAddress)

      // Validate input flags
      this.validateFlags(flags)

      // Generate an absolute filename from the name.
      const filename = `${__dirname}/../../wallets/${flags.name}.json`

      const newAddress = await this.getAvalancheAddress(filename, !flags.noupdate)

      // Display the address as a QR code.
      this.qrcode.generate(newAddress, { small: true })
      this.log(`X-Chain address: ${newAddress}`)

      return newAddress
    } catch (err) {
      if (err.message) console.log(err.message)
      else console.log('Error in GetAddress.run: ', err)

      return 0
    }
  }

  async getAvalancheAddress (filename, shouldUpdate = true) {
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
