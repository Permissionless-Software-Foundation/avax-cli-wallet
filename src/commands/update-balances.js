/*
  oclif command to update the balances stored in the wallet.json file.
*/

'use strict'

const AppUtils = require('../util')
const appUtils = new AppUtils()

const globalConfig = require('../../config')

const { Avalanche, BinTools } = require('avalanche')

const { Command, flags } = require('@oclif/command')

class UpdateBalances extends Command {
  constructor (argv, config) {
    super(argv, config)

    // Default libraries.
    this.ava = new Avalanche(globalConfig.AVAX_IP, parseInt(globalConfig.AVAX_PORT))
    this.appUtils = appUtils
    this.bintools = BinTools.getInstance()
    this.xchain = this.ava.XChain()
  }

  async run () {
    try {
      const { flags } = this.parse(UpdateBalances)

      this.validateFlags(flags)

      // Update the balances in the wallet.
      const walletInfo = await this.updateBalances(flags)

      console.log(`Existing balance: ${walletInfo.avaxAmount} AVAX`)
      return walletInfo
    } catch (err) {
      // Catch most common error: querying too fast.
      console.log('Error in UpdateBalances/run()', err)
      return 0
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

  // Update the balances in the wallet.
  async updateBalances (flags) {
    const name = flags.name

    // Open the wallet data file.
    const filename = `${__dirname}/../../wallets/${name}.json`
    const walletInfo = this.appUtils.openWallet(filename)
    // walletInfo.name = name

    const assets = await this.xchain.getAllBalances(walletInfo.addressString)

    if (assets.length === 0) {
      walletInfo.assets = []
      walletInfo.avaxAmount = 0
      await this.appUtils.saveWallet(filename, walletInfo)

      return walletInfo
    }

    const avaxBuffer = await this.xchain.getAVAXAssetID()

    if (flags.ignoreTokens) {
      let asset = assets.find(item => item.asset === 'AVAX')
      if (!asset) {
        asset = { balance: '0' }
      }

      const assetDetail = await this.xchain.getAssetDescription(avaxBuffer)

      const avaxAmount =
        parseInt(asset.balance) / Math.pow(10, assetDetail.denomination)

      walletInfo.assets = []
      walletInfo.avaxAmount = parseFloat(avaxAmount)

      await this.appUtils.saveWallet(filename, walletInfo)
      return walletInfo
    }

    const promises = []
    for (const asset of assets) {
      if (asset.asset === 'AVAX') {
        promises.push(this.xchain.getAssetDescription(avaxBuffer))
        continue
      }
      // const buffer = this.bintools.cb58Decode(asset.asset)
      promises.push(this.xchain.getAssetDescription(asset.asset))
    }

    const details = await Promise.all(promises)
    let avaxAmount = '0'

    for (let index = 0; index < assets.length; index++) {
      const asset = assets[index]
      const assetDetail = details[index]
      const balance =
        parseInt(asset.balance) / Math.pow(10, assetDetail.denomination)

      asset.name = assetDetail.name
      asset.symbol = assetDetail.symbol
      asset.denomination = assetDetail.denomination
      asset.balance = balance.toFixed(assetDetail.denomination)
      if (asset.asset === 'AVAX') {
        avaxAmount = asset.balance
      }
    }

    walletInfo.assets = assets
    walletInfo.avaxAmount = parseFloat(avaxAmount)

    await this.appUtils.saveWallet(filename, walletInfo)
    return walletInfo
  }
}

UpdateBalances.description =
  'Poll the network and update the balances of the wallet.'

UpdateBalances.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' }),
  ignoreTokens: flags.boolean({
    char: 'i',
    description: 'Ignore and burn tokens'
  })
}

module.exports = UpdateBalances
