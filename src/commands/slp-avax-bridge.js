/*
  oclif command to send tokens to the slp-avax bridge with the proper memo field

  This command is optimized for privacy the same way the 'send' command is. See
  that command for details.

  Spends all token UTXOs for the same token to create a tx compatible with the bridge
  It laverages on the send tokens command to generate the Tx object
*/

'use strict'

const GetAddress = require('./get-address')
const UpdateBalances = require('./update-balances')
const Send = require('./send')
const SendTokens = require('./send-tokens')

const globalConfig = require('../../config')

const { Avalanche, BinTools, BN } = require('avalanche')
const avm = require('avalanche/dist/apis/avm')

const AppUtils = require('../util')
const appUtils = new AppUtils()

const bchjs = new globalConfig.BCHLIB({
  restURL: globalConfig.MAINNET_REST,
  apiToken: globalConfig.JWT
})

// Used for debugging and error reporting.
const util = require('util')
util.inspect.defaultOptions = { depth: 2 }

const { Command, flags } = require('@oclif/command')

class SlpAvaxBridge extends Command {
  constructor (argv, config) {
    super(argv, config)
    this.appUtils = appUtils // Allows for easy mocking for unit tests.

    // this.ava = new Avalanche(globalConfig.AVAX_IP, parseInt(globalConfig.AVAX_PORT))
    this.ava = new Avalanche('api.avax.network', 443, 'https')
    this.bintools = BinTools.getInstance()
    this.xchain = this.ava.XChain()
    this.avm = avm
    this.BN = BN
    this.updateBalances = new UpdateBalances(undefined)
    this.send = new Send()
    this.sendTokens = new SendTokens()

    this.bchjs = bchjs
  }

  async run () {
    try {
      const { flags } = this.parse(SlpAvaxBridge)

      // Ensure flags meet qualifiying critieria.
      this.validateFlags(flags)

      const name = flags.name // Name of the wallet.
      const qty = flags.qty // Amount to send in token.
      const sendToAddr = flags.sendAddr // The address to send to.
      const tokenId = flags.tokenId // token ID.
      const memo = `bch ${flags.bchAddr.trim()}`

      this.sendTokens.xchain = this.xchain

      // Open the wallet data file.
      const filename = `${__dirname}/../../wallets/${name}.json`
      let walletInfo = appUtils.openWallet(filename)

      // Update balances before sending.
      walletInfo = await this.updateBalances.updateBalances(flags)

      // Get a list of token UTXOs from the wallet for this token.
      const tokenUtxos = this.sendTokens.getTokenUtxos(tokenId, walletInfo)

      // Instatiate the Send class so this function can reuse its selectUTXO() code.
      const avaxUtxo = await this.send.selectUTXO(0.001, walletInfo.avaxUtxos)

      // Exit if there is no UTXO big enough to fulfill the transaction.
      if (!avaxUtxo.amount) {
        this.log('Could not find a UTXO big enough for this transaction. More avax needed.')
        throw new Error('Could not find a UTXO big enough for this transaction')
      }

      // Generate a new address, for sending change to.
      const getAddress = new GetAddress()
      const changeAddress = await getAddress.getAvalancheAddress(filename)

      // Send the token, transfer change to the new address
      const tx = await this.sendTokens.sendTokens(
        avaxUtxo,
        tokenUtxos,
        qty,
        sendToAddr,
        changeAddress,
        walletInfo,
        memo
      )

      const txid = await this.appUtils.broadcastAvaxTx(tx)

      this.appUtils.displayAvaxTxid(txid)
      return txid
    } catch (err) {
      console.log('Error in slp-avax-bridge.js/run(): ', err)
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

    const qty = flags.qty
    if (isNaN(Number(qty))) {
      throw new Error('You must specify a quantity of tokens with the -q flag.')
    }

    const sendAddr = flags.sendAddr
    if (!sendAddr || sendAddr === '') {
      throw new Error('You must specify a send-to address with the -a flag.')
    }

    const tokenId = flags.tokenId
    if (!tokenId || tokenId === '') {
      throw new Error('You must specifcy the avalanche token ID')
    }

    const addrBuffer = this.xchain.parseAddress(sendAddr)
    const isValid = Boolean(addrBuffer)
    if (!isValid) {
      throw new Error(
        'You must specify a valid avalanche address with the -a flag'
      )
    }
    const receiver = flags.bchAddr
    if (typeof receiver !== 'string' || receiver.length === 0) {
      throw new Error('Invalid BCH or SLP Address')
    }
    // check the bch address is valid
    this.bchjs.Address.toLegacyAddress(receiver)

    return true
  }
}

SlpAvaxBridge.description = 'Send tokens to the slp-avax bridge with the proper memo field'

SlpAvaxBridge.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' }),
  tokenId: flags.string({ char: 't', description: 'Token ID' }),
  bchAddr: flags.string({ char: 'b', description: 'BCH Address to receive the tokens on the BCH side' }),
  sendAddr: flags.string({
    char: 'a',
    description: 'Avalache address to send tokens to'
  }),
  qty: flags.string({ char: 'q', decription: 'Quantity of tokens to send' })
}

module.exports = SlpAvaxBridge
