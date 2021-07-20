/*
  Forked from get-address.js. This command generates a private key and public
  address. Both are displayed on the command line along with a QR code.
  This is exactly the same thing as generating a 'paper wallet'.
  The QR code for private key can be 'swept' with the bitcoin.com wallet.

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

const { Avalanche, BinTools } = require('avalanche')
const { KeyChain } = require('avalanche/dist/apis/evm')

// Mainnet by default.
const bchjs = new globalConfig.BCHLIB({
  restURL: globalConfig.MAINNET_REST,
  apiToken: globalConfig.JWT
})

const { Command, flags } = require('@oclif/command')

// let _this

class GetKey extends Command {
  constructor (argv, config) {
    super(argv, config)
    this.bchjs = bchjs
    this.ava = new Avalanche('api.avax.network', 443, 'https')
    this.appUtils = appUtils
    this.localConfig = globalConfig
    this.bintools = BinTools.getInstance()
    this.bip39 = bip39
    this.HDKey = HDKey
    this.qrcode = qrcode
  }

  async run () {
    try {
      const { flags } = this.parse(GetKey)

      // Validate input flags
      this.validateFlags(flags)

      // Generate an absolute filename from the name.
      const filename = `${__dirname}/../../wallets/${flags.name}.json`

      const newPair = await this.getKeyPair(filename, flags.index)

      const newAddress = newPair.pub

      // Display the Private Key
      this.qrcode.generate(newPair.priv, { small: true })
      this.log(`Private Key: ${newPair.priv}`)
      this.log(`Public Key hex: ${newPair.pubHex}`)

      // Display the address as a QR code.
      this.qrcode.generate(newAddress, { small: true })
      this.log(`${newAddress}`)
      // Display the address to the user.
      return newPair
    } catch (err) {
      if (err.message) console.log(err.message)
      else console.log('Error in GetKey.run: ', err)
      return null
    }
  }

  // Get a private/public key pair.
  async getKeyPair (filename, index) {
    const walletInfo = this.appUtils.openWallet(filename)

    // check latest generated address if index is not provided
    if (typeof index !== 'number' || index < 0) {
      index = walletInfo.nextAddress
    }

    // parse the mnemonic into a seed
    const seed = this.bip39.mnemonicToSeedSync(walletInfo.mnemonic)
    // create the master node and derive it
    const master = this.HDKey.fromMasterSeed(seed)
    const derivationPath = `${this.localConfig.AVA_ACCOUNT_PATH}/0/${index}`
    const change = master.derive(derivationPath)

    const xkeyChain = new KeyChain(this.ava.getHRP(), 'X')
    xkeyChain.importKey(change.privateKey)

    const priv = 'PrivateKey-' + this.bintools.cb58Encode(change.privateKey)
    const [pub] = xkeyChain.getAddressStrings()
    const pubHex = change.publicKey.toString('hex')

    return { priv, pub, pubHex }
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

GetKey.description = 'Generate a new private/public key pair.'

GetKey.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' }),
  index: flags.integer({ char: 'i', description: 'HD Address index (the default is the latest)' })
}

module.exports = GetKey
