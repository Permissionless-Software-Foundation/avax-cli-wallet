/*
  Creates a new HD wallet. Save the 24-word Mnemonic private key to a .json file.
  There isn't any official documentation on how to do the mnemonic with avalanche yet
*/

'use strict'

const AppUtils = require('../util')
const appUtils = new AppUtils()

const globalConfig = require('../../config')
const HDKey = require('hdkey')
const bip39 = require('bip39')

const { Avalanche, BinTools } = require('avalanche')
const { KeyChain } = require('avalanche/dist/apis/evm')

// Mainnet by default
const { Command, flags } = require('@oclif/command')

const fs = require('fs')

// let _this

class CreateWallet extends Command {
  constructor (argv, config) {
    super(argv, config)
    // _this = this

    this.fs = fs
    this.localConfig = globalConfig
    // this.ava = new Avalanche(globalConfig.AVAX_IP, parseInt(globalConfig.AVAX_PORT))
    this.ava = new Avalanche('api.avax.network', 443, 'https')
    this.bintools = BinTools.getInstance()
    this.bip39 = bip39
    this.HDKey = HDKey
  }

  async run () {
    try {
      const { flags } = this.parse(CreateWallet)

      // Validate input flags
      this.validateFlags(flags)

      const filename = `${__dirname}/../../wallets/${flags.name}.json`

      if (!flags.description) {
        flags.description = ''
      }

      return this.createWallet(filename, flags.description)
    } catch (err) {
      console.log('Error in create-wallet.js/run(): ', err)

      return 0
    }
  }

  async createWallet (filename, desc) {
    try {
      if (!filename || filename === '') {
        throw new Error('filename required.')
      }

      if (this.fs.existsSync(filename)) {
        throw new Error('filename already exist')
      }

      // generate the nemonic
      const mnemonic = this.bip39.generateMnemonic(256)
      // parse them into a seed
      const seed = this.bip39.mnemonicToSeedSync(mnemonic)
      // create the master node and derive it
      const masterHdKey = this.HDKey.fromMasterSeed(seed)
      const accountHdKey = masterHdKey.derive(
        this.localConfig.AVA_ACCOUNT_PATH + '/0/0'
      )

      // Get the node information
      const xkeyChain = new KeyChain(this.ava.getHRP(), 'X')
      const keypair = xkeyChain.importKey(accountHdKey.privateKey)
      const addressString = keypair.getAddressString()
      const privKey =
        'PrivateKey-' + this.bintools.cb58Encode(accountHdKey.privateKey)

      const walletData = {
        network: 'mainnet',
        type: 'mnemonic',
        seed: seed.toString('hex'),
        mnemonic,
        addressString,
        privateKey: privKey,
        description: desc ?? '',
        assets: [],
        avaxAmount: 0
      }

      await appUtils.saveWallet(filename, walletData)

      return walletData
    } catch (err) {
      if (err.code !== 'EEXIT') {
        console.log('Error in createAvaxWallet().')
      }
      throw err
    }
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

CreateWallet.description = 'Generate a new HD Wallet.'

CreateWallet.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' }),
  description: flags.string({
    char: 'd',
    description: 'Description of the wallet'
  })
}

module.exports = CreateWallet
