/*
  oclif command to burn a specific quantity of Avalanche native tokens.

  Burning tokens is exactly the same as sending tokens without change. The only
  difference is that the output indicates the difference.

  e.g. If you have 100 tokens and want to burn 10, you use the 100 token UTXO
  as input, and set the output with a quantity of 90. That will effectively burn 10 tokens.
*/

'use strict'

const GetAddress = require('./get-address')
const UpdateBalances = require('./update-balances')
const AppUtils = require('../util')
const Send = require('./send')
const SendTokens = require('./send-tokens')

const { Avalanche, BinTools, BN } = require('avalanche')
const avm = require('avalanche/dist/apis/avm')

// Used for debugging and error reporting.
const util = require('util')
util.inspect.defaultOptions = { depth: 2 }

const { Command, flags } = require('@oclif/command')

class BurnTokens extends Command {
  constructor (argv, config) {
    super(argv, config)
    // _this = this

    // this.ava = new Avalanche(globalConfig.AVAX_IP, parseInt(globalConfig.AVAX_PORT))
    this.ava = new Avalanche('api.avax.network', 443, 'https')
    this.bintools = BinTools.getInstance()
    this.xchain = this.ava.XChain()
    this.avm = avm
    this.BN = BN

    // Encapsulate local libraries for each mocking for unit tests.
    this.appUtils = new AppUtils()
    this.updateBalances = new UpdateBalances()
    this.send = new Send()
    this.sendTokens = new SendTokens()
    this.getAddress = new GetAddress()
  }

  async run () {
    try {
      const { flags } = this.parse(BurnTokens)

      const name = flags.name // Name of the wallet.
      const burnQty = flags.qty // Amount to send in token.
      const tokenId = flags.tokenId // token ID.
      if (!flags.memo) {
        flags.memo = ''
      }

      // Open the wallet data file.
      const filename = `${__dirname}/../../wallets/${name}.json`
      let walletInfo = this.appUtils.openWallet(filename)

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

      const tx = await this.burnTokens(
        avaxUtxo,
        tokenUtxos,
        burnQty,
        changeAddress,
        walletInfo,
        flags.memo
      )

      const txid = await this.appUtils.broadcastAvaxTx(tx)
      this.appUtils.displayAvaxTxid(txid)
      return txid
    } catch (err) {
      console.log('Error in burn-tokens.js/run(): ')
      console.log(err)
      return 0
    }
  }

  // Generates the avalanche transaction, ready to broadcast to network.
  async burnTokens (avaxUtxo, tokenUtxos, burnQty, changeAddress, walletInfo, memo) {
    try {
      changeAddress = this.xchain.parseAddress(changeAddress)

      if (!tokenUtxos || tokenUtxos.length === 0) {
        throw new Error('At least one utxo with tokens must be provided')
      }

      // Generate a KeyChain for the wallet with the avax to pay the fee
      let xkeyChain = this.appUtils.avalancheChangeAddress(walletInfo, avaxUtxo.hdIndex)
      // add all the keys for the addresses with tokens
      for (let i = 0; i < tokenUtxos.length; i++) {
        const thisUTXO = tokenUtxos[i]
        const kc = this.appUtils.avalancheChangeAddress(walletInfo, thisUTXO.hdIndex)
        xkeyChain = xkeyChain.union(kc)
      }

      // encode memo
      const memoBuffer = Buffer.from(memo)

      const avaxIDBuffer = await this.xchain.getAVAXAssetID()

      // calculate remainder in navax
      const fee = this.xchain.getDefaultTxFee()
      const utxoBalance = new this.BN(avaxUtxo.amount)
      const remainder = utxoBalance.sub(fee)

      if (remainder.isNeg()) {
        throw new Error('Not enough avax in the selected utxo')
      }

      // add token utxos as input
      let tokenAmount = new this.BN(0)
      const assetID = tokenUtxos[0].assetID
      const assetIDBuffer = this.bintools.cb58Decode(assetID)

      const inputs = tokenUtxos.reduce((inputCol, utxo) => {
        const utxoAddr = this.xchain.parseAddress(walletInfo.addresses[utxo.hdIndex])
        const amount = new this.BN(utxo.amount)
        tokenAmount = tokenAmount.add(amount)

        const tokenTransferInput = new this.avm.SECPTransferInput(amount)
        tokenTransferInput.addSignatureIdx(0, utxoAddr)

        const tokenTxInput = new this.avm.TransferableInput(
          this.bintools.cb58Decode(utxo.txid),
          Buffer.from(utxo.outputIdx, 'hex'),
          assetIDBuffer,
          tokenTransferInput
        )

        inputCol.push(tokenTxInput)
        return inputCol
      }, [])

      // add avax utxo as input
      const transferInput = new this.avm.SECPTransferInput(utxoBalance)
      const avaxAddr = this.xchain.parseAddress(walletInfo.addresses[avaxUtxo.hdIndex])

      transferInput.addSignatureIdx(0, avaxAddr)
      const txInput = new this.avm.TransferableInput(
        this.bintools.cb58Decode(avaxUtxo.txid),
        Buffer.from(avaxUtxo.outputIdx, 'hex'),
        avaxIDBuffer,
        transferInput
      )
      inputs.push(txInput)

      // calculate remainder token quantity after burning
      const { denomination } = await this.xchain.getAssetDescription(assetIDBuffer)
      burnQty = burnQty * Math.pow(10, denomination)
      const burnBN = new this.BN(burnQty)
      const remainderTokens = tokenAmount.sub(burnBN)

      if (remainderTokens.isNeg()) {
        throw new Error('Not enough tokens in the selected utxos')
      }

      // get the desired outputs for the transaction if any
      const outputs = []
      if (!remainderTokens.isZero()) {
        const tokenTransferOutput = new this.avm.SECPTransferOutput(
          remainderTokens,
          [changeAddress]
        )
        const tokenTransferableOutput = new this.avm.TransferableOutput(
          assetIDBuffer,
          tokenTransferOutput
        )
        outputs.push(tokenTransferableOutput)
      }

      // if there's avax remaining after the tx, add them to the outputs
      if (!remainder.isZero()) {
        const avaxTransferOutput = new this.avm.SECPTransferOutput(
          remainder,
          [changeAddress]
        )
        const avaxTransferableOutput = new this.avm.TransferableOutput(
          avaxIDBuffer,
          avaxTransferOutput
        )
        // Add the AVAX output = the avax input minus the fee
        outputs.push(avaxTransferableOutput)
      }

      // Build the transcation
      const baseTx = new this.avm.BaseTx(
        this.ava.getNetworkID(),
        this.bintools.cb58Decode(this.xchain.getBlockchainID()),
        outputs,
        inputs,
        memoBuffer
      )

      const unsignedTx = new this.avm.UnsignedTx(baseTx)
      return unsignedTx.sign(xkeyChain)
    } catch (err) {
      console.log('Error in send-token.js/sendTokens()')
      throw err
    }
  }

  // Validate the proper flags are passed in.
  validateFlags (flags) {
    // console.log(`flags: ${JSON.stringify(flags, null, 2)}`)

    // Exit if wallet not specified.
    const name = flags.name
    if (typeof name !== 'string' || !name.length) {
      throw new Error('You must specify a wallet with the -n flag.')
    }

    const qty = flags.qty
    if (isNaN(Number(qty))) {
      throw new Error('You must specify a quantity of tokens with the -q flag.')
    }

    const tokenId = flags.tokenId
    if (typeof tokenId !== 'string' || !tokenId.length) {
      throw new Error('You must specifcy the SLP token ID')
    }

    return true
  }
}

BurnTokens.description = 'Burn Avalanche native tokens.'

BurnTokens.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' }),
  tokenId: flags.string({ char: 't', description: 'Token ID' }),
  memo: flags.string({ char: 'm', description: 'Memo field' }),
  qty: flags.string({ char: 'q', decription: 'Quantity of tokens to send' })
}

module.exports = BurnTokens
