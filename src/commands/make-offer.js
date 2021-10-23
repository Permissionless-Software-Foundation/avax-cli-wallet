/*
  Makes an offer for selling a token on the X-chain DEX.
  This is the first part of a collaborative transaction.
*/

'use strict'

const UpdateBalances = require('./update-balances')
const SendTokens = require('./send-tokens')

const { Avalanche, BinTools, BN } = require('avalanche')
const avm = require('avalanche/dist/apis/avm')

const AppUtils = require('../util')
const appUtils = new AppUtils()

// Used for debugging and error reporting.
const util = require('util')
util.inspect.defaultOptions = { depth: 2 }

const { Command, flags } = require('@oclif/command')

class MakeOffer extends Command {
  constructor (argv, config) {
    super(argv, config)

    /// this.ava = new Avalanche(globalConfig.AVAX_IP, parseInt(globalConfig.AVAX_PORT))
    this.ava = new Avalanche('api.avax.network', 443, 'https')
    this.bintools = BinTools.getInstance()
    this.xchain = this.ava.XChain()
    this.avm = avm
    this.BN = BN

    this.updateBalances = new UpdateBalances()

    this.appUtils = appUtils
    this.sendTokens = new SendTokens()
  }

  async run () {
    try {
      const { flags } = this.parse(MakeOffer)

      this.validateFlags(flags)

      const tokenAmount = flags.amount
      const avaxAmount = flags.avax
      const tokenId = flags.tokenId // token ID.
      const name = flags.name // Name of the wallet.

      // Open the wallet data file.
      const filename = `${__dirname}/../../wallets/${name}.json`
      let walletInfo = appUtils.openWallet(filename)

      // Update balances before sending.
      walletInfo = await this.updateBalances.updateBalances(flags)
      let txInfo = {}

      if (flags.operation === 'sell') {
        txInfo = await this.sell(walletInfo, tokenId, tokenAmount, avaxAmount)
        this.appUtils.readTx(txInfo.txHex)
      }

      // console.log(`${flags.operation}: ${JSON.stringify(txInfo, null, 2)}`)

      return txInfo
    } catch (err) {
      console.log('Error in send-tokens.js/run(): ', err)
      return 0
    }
  }

  async sell (walletInfo, tokenId, tokenAmount, avaxAmount) {
    try {
      const avaxID = await this.xchain.getAVAXAssetID()
      const tokenBuffer = await this.bintools.cb58Decode(tokenId)

      tokenAmount = new this.BN(tokenAmount)
      avaxAmount = new this.BN(avaxAmount)

      // Get a list of token UTXOs from the wallet for this token.
      const tokenUtxos = this.sendTokens.getTokenUtxos(tokenId, walletInfo)

      const availableTokenAmount = tokenUtxos.reduce((total, current) => {
        return total.add(new this.BN(current.amount))
      }, new this.BN(0))

      if (availableTokenAmount.lt(tokenAmount)) {
        throw new Error('Not enough tokens to be send')
      }

      const addrReferences = {}
      const inputs = tokenUtxos.map(item => {
        const address = walletInfo.addresses[item.hdIndex]
        const utxo = this.appUtils.encodeUtxo(item, address)
        const utxoID = this.bintools.cb58Encode(utxo.getOutputIdx())

        addrReferences[utxoID] = address
        return utxo
      })

      // get the desired token outputs for the transaction
      const returnAddr = walletInfo.addresses[tokenUtxos[0].hdIndex]
      const returnAddrBuff = this.xchain.parseAddress(returnAddr)
      const avaxOutput = this.appUtils.generateOutput(
        avaxAmount,
        returnAddrBuff,
        avaxID
      )
      const outputs = [avaxOutput]

      const remainder = availableTokenAmount.sub(tokenAmount)
      if (remainder.gt(new this.BN(0))) {
        const remainderOut = this.appUtils.generateOutput(
          remainder,
          returnAddrBuff,
          tokenBuffer
        )
        outputs.push(remainderOut)
      }

      // Build the transcation
      const partialTx = new this.avm.BaseTx(
        this.ava.getNetworkID(),
        this.bintools.cb58Decode(this.xchain.getBlockchainID()),
        outputs,
        inputs,
        Buffer.from('sell offer')
      )

      // This is what Alice has to send and what Bob will receive
      const hexString = partialTx.toBuffer().toString('hex')
      return {
        txHex: hexString,
        addrReferences
      }
    } catch (err) {
      console.log('Error in make-offer.js/sell()')
      throw err
    }
  }

  // Validate the proper flags are passed in.
  validateFlags (flags) {
    // Exit if wallet not specified.
    const name = flags.name
    if (typeof name !== 'string' || !name.length) {
      throw new Error('You must specify a wallet with the -n flag.')
    }

    const operation = flags.operation
    if (operation === 'sell') {
      const amount = flags.amount
      if (isNaN(Number(amount))) {
        throw new Error('You must specify a token quantity with the -q flag.')
      }

      const avax = flags.avax
      if (isNaN(Number(avax))) {
        throw new Error('You must specify an avax quantity with the -a flag.')
      }

      const tokenId = flags.tokenId
      if (typeof tokenId !== 'string' || !tokenId.length) {
        throw new Error('You must specifiy the assetID ID with the -t flag')
      }

      return true
    }

    if (operation === 'buy') {
      return true
    }

    // Exit if wallet not specified.
    throw new Error(
      'You must specifiy the operation type (either sell or buy) with the -o flag'
    )
  }
}

MakeOffer.description = 'Create an offer to either buy or sell tokens'

MakeOffer.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' }),
  tokenId: flags.string({ char: 't', description: 'Token ID' }),
  amount: flags.integer({
    char: 'q',
    decription: 'Quantity of tokens to send'
  }),
  avax: flags.integer({
    char: 'a',
    decription: 'Quantity of avax to request (must be in nAvax)'
  }),
  operation: flags.string({
    char: 'o',
    description: 'The operation to perform (buy, or sell)'
  })
}

module.exports = MakeOffer
