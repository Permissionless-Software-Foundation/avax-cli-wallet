/*
  oclif command to send all avax and ANT in a wallet to a single address.

  This can be used to consolidate all kind of UTXOs to another wallet.

  This command has a negative effect on the users privacy by
  linking all addresses and UTXOs. This effectively deanonymize users.

  The order of operations matter. The code below complete the following steps
  *in order*:
  -Add each UTXO as an input to the TX, accumulating the total
  -Add the output
  -Build the transaction
  -Broadcast the transaction

  Note: This will not send any NFT.
*/

'use strict'

const UpdateBalances = require('./update-balances')

const AppUtils = require('../util')
const appUtils = new AppUtils()

const { Avalanche, BinTools, BN } = require('avalanche')
const avm = require('avalanche/dist/apis/avm')

// Used for debugging and error reporting.
const util = require('util')
util.inspect.defaultOptions = { depth: 2 }

const { Command, flags } = require('@oclif/command')
class SendAll extends Command {
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
  }

  async run () {
    try {
      const { flags } = this.parse(SendAll)
      if (!flags.memo) {
        flags.memo = ''
      }

      // Ensure flags meet qualifiying critieria.
      this.validateFlags(flags)

      const sendToAddr = flags.sendAddr // The address to send to.

      // Open the wallet data file.
      const filename = `${__dirname}/../../wallets/${flags.name}.json`
      let walletInfo = appUtils.openWallet(filename)

      // Update balances before sending.
      walletInfo = await this.updateBalances.updateBalances(flags)

      const tx = await this.sendAll(sendToAddr, walletInfo, flags.memo)
      // broadcast
      const txid = await this.appUtils.broadcastAvaxTx(tx)
      this.appUtils.displayAvaxTxid(txid)
      return txid
    } catch (err) {
      console.log('Error in send-all.js/run: ', err)
      return 0
    }
  }

  // Sends all avax and ANTs in a wallet to a new address.
  async sendAll (sendToAddr, walletInfo, memo) {
    try {
      const avaxUtxos = walletInfo.avaxUtxos || []
      const tokenUtxos = walletInfo.otherUtxos || []

      if (!Array.isArray(avaxUtxos) || !Array.isArray(tokenUtxos)) {
        throw new Error('utxos must be an array')
      }

      sendToAddr = this.xchain.parseAddress(sendToAddr)
      const memoBuffer = Buffer.from(memo)

      const avaxAssetID = await this.xchain.getAVAXAssetID()

      // Generate a KeyChain for the wallet
      let xkeyChain = this.appUtils.avalancheChangeAddress(walletInfo, 0)
      // add all the keys for the addresses with tokens
      for (let i = 1; i < walletInfo.nextAddress; i++) {
        const kc = this.appUtils.avalancheChangeAddress(walletInfo, i)
        xkeyChain = xkeyChain.union(kc)
      }

      const totalAvax = new this.BN(0)
      // gather all the avax utxos
      const avaxInputs = avaxUtxos.reduce((ins, addr) => {
        const addrUtxos = addr.utxos.map(utxo => {
          const amount = new this.BN(utxo.amount)
          const addressBuffer = this.xchain.parseAddress(addr.address)
          totalAvax.iadd(amount)

          const transferInput = new this.avm.SECPTransferInput(amount)
          transferInput.addSignatureIdx(0, addressBuffer)

          const transferableInput = new this.avm.TransferableInput(
            this.bintools.cb58Decode(utxo.txid),
            Buffer.from(utxo.outputIdx, 'hex'),
            avaxAssetID,
            transferInput
          )

          return transferableInput
        })

        ins.push(...addrUtxos)
        return ins
      }, [])

      const totalTokens = {}
      // gather all the other utxos
      const tokenInputs = tokenUtxos.reduce((ins, addr) => {
        const addrUtxos = addr.utxos.map(utxo => {
          const amount = new this.BN(utxo.amount)
          const assetID = this.bintools.cb58Decode(utxo.assetID)
          const addressBuffer = this.xchain.parseAddress(addr.address)
          if (!totalTokens[utxo.assetID]) {
            totalTokens[utxo.assetID] = { total: new this.BN(0), buffer: assetID }
          }
          totalTokens[utxo.assetID].total.iadd(amount)
          const transferInput = new this.avm.SECPTransferInput(amount)
          transferInput.addSignatureIdx(0, addressBuffer)

          const transferableInput = new this.avm.TransferableInput(
            this.bintools.cb58Decode(utxo.txid),
            Buffer.from(utxo.outputIdx, 'hex'),
            assetID,
            transferInput
          )

          return transferableInput
        })

        ins.push(...addrUtxos)
        return ins
      }, [])

      const inputs = [...avaxInputs, ...tokenInputs]

      // calculate remainding avax after fee
      const fee = this.xchain.getTxFee()
      const remainder = totalAvax.sub(fee)
      if (remainder.isNeg()) {
        throw new Error('Not enough avax to perform this tx')
      }
      // set the ouputs
      const outputs = []
      const avaxTransferOutput = new this.avm.SECPTransferOutput(
        remainder,
        [sendToAddr]
      )
      const avaxTransferableOutput = new this.avm.TransferableOutput(
        avaxAssetID,
        avaxTransferOutput
      )
      outputs.push(avaxTransferableOutput)

      // add all tokens as outputs
      const tokens = Object.values(totalTokens)
      for (const token of tokens) {
        const tokenTransferOutput = new this.avm.SECPTransferOutput(
          token.total,
          [sendToAddr]
        )

        const tokenTransferableOutput = new this.avm.TransferableOutput(
          token.buffer,
          tokenTransferOutput
        )
        outputs.push(tokenTransferableOutput)
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
      console.log('Error in sendAll()')
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

    const sendAddr = flags.sendAddr
    if (typeof sendAddr !== 'string' || !sendAddr.length) {
      throw new Error('You must specify a sent-to address with the -a flag.')
    }

    const addrBuffer = this.xchain.parseAddress(sendAddr)
    const isValid = Boolean(addrBuffer)
    if (!isValid) {
      // console.log(sendAddr)
      throw new Error(
        'You must specify a valid avalanche address with the -a flag'
      )
    }

    return true
  }
}

SendAll.description = `Send all tokens in a wallet to another address. **Degrades Privacy**
Send all avax and ANT in a wallet to another address.

This method has a negative impact on privacy by linking all addresses in a
wallet. If privacy of a concern, CoinJoin should be used.
This is a good article describing the privacy concerns:
https://bit.ly/2TnhdVc
`

SendAll.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' }),
  sendAddr: flags.string({ char: 'a', description: 'avalanche address to send to' })
}

module.exports = SendAll
