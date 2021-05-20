/*
  oclif command to send BCH to an address.
*/

'use strict'

const UpdateBalances = require('./update-balances')
const globalConfig = require('../../config')

const AppUtils = require('../util')
const appUtils = new AppUtils()

const { Avalanche, BinTools, BN } = require('avalanche')
const { KeyChain } = require('avalanche/dist/apis/evm')
const avm = require('avalanche/dist/apis/avm')

const { Command, flags } = require('@oclif/command')

class Send extends Command {
  constructor (argv, config) {
    super(argv, config)
    // _this = this

    this.ava = new Avalanche(globalConfig.AVAX_IP, parseInt(globalConfig.AVAX_PORT))
    this.bintools = BinTools.getInstance()
    this.xchain = this.ava.XChain()
    this.appUtils = appUtils
    this.KeyChain = KeyChain
    this.avm = avm
    this.BN = BN
    this.updateBalances = new UpdateBalances(undefined)
  }

  async run () {
    try {
      const { flags } = this.parse(Send)

      // Ensure flags meet qualifiying critieria.
      this.validateFlags(flags)

      const name = flags.name // Name of the wallet.
      const avax = flags.avax // Amount to send in AVAX.
      const sendToAddr = flags.sendAddr // The address to send to.
      if (!flags.memo) {
        flags.memo = ''
      }

      // Open the wallet data file.
      const filename = `${__dirname}/../../wallets/${name}.json`
      let walletInfo = this.appUtils.openWallet(filename)

      // Update balances before sending.

      walletInfo = await this.updateBalances.updateBalances(flags)

      // Get info on assets controlled by this address
      const avaxAmount = walletInfo.avaxAmount

      this.log(`Existing balance: ${walletInfo.avaxAmount} AVAX`)
      if (avaxAmount <= avax) {
        throw new Error('There\'s not enough avax to perform the transaction')
      }

      // Send the AVAX
      const tx = await this.sendAvax(
        avax,
        sendToAddr,
        walletInfo,
        flags.memo
      )

      const txid = await this.appUtils.broadcastAvaxTx(tx)

      this.appUtils.displayAvaxTxid('done')
      return txid
    } catch (err) {
      console.log('Error in send.js/run(): ', err)
      return 0
    }
  }

  // Sends Avax to
  async sendAvax (avaxAmount, sendToAddr, walletInfo, memo) {
    try {
      sendToAddr = this.xchain.parseAddress(sendToAddr)

      // Get the node information
      const xkeyChain = new this.KeyChain(this.ava.getHRP(), 'X')
      xkeyChain.importKey(walletInfo.privateKey)

      const avaxIDBuffer = await this.xchain.getAVAXAssetID()
      const { denomination } = await this.xchain.getAssetDescription(avaxIDBuffer)
      const addresses = xkeyChain.getAddresses()
      const addressStrings = xkeyChain.getAddressStrings()

      // encode memo
      let memoBuffer
      if (!memo) {
        memoBuffer = Buffer.from(memo)
      }

      const { utxos: utxoSet } = await this.xchain.getUTXOs(addressStrings)
      const utxos = utxoSet.getAllUTXOs()

      if (!utxos.length) {
        throw new Error('There are no UTXOs in the address')
      }
      // get the token information

      const balance = utxoSet.getBalance(addresses, avaxIDBuffer)
      const fee = this.xchain.getDefaultTxFee()

      const num = avaxAmount * Math.pow(10, denomination)
      const amount = new this.BN(num)
      const remainder = balance.sub(fee).sub(amount)

      if (remainder.isNeg()) {
        throw new Error('Not enough founds to pay for transaction')
      }

      // get the inputs for the transcation
      const inputs = utxos.reduce((txInputs, utxo) => {
        // TypeID 7 is a transaction utxo, everything else gets skipped
        const utxoType = utxo.getOutput().getTypeID()
        const isAvaxAsset = utxo.getAssetID().toString('hex') === avaxIDBuffer.toString('hex')
        if (utxoType !== 7 || !isAvaxAsset) {
          return txInputs
        }

        const amountOutput = utxo.getOutput()
        const amt = amountOutput.getAmount().clone()
        const txid = utxo.getTxID()
        const outputidx = utxo.getOutputIdx()

        const transferInput = new this.avm.SECPTransferInput(amt)
        transferInput.addSignatureIdx(0, addresses[0])
        const input = new this.avm.TransferableInput(
          txid,
          outputidx,
          avaxIDBuffer,
          transferInput
        )
        txInputs.push(input)
        return txInputs
      }, [])

      // get the desired outputs for the transaction
      const outputs = []
      const firstTransferOutput = new this.avm.SECPTransferOutput(
        amount,
        [sendToAddr]
      )
      const firstTransferableOutput = new this.avm.TransferableOutput(
        avaxIDBuffer,
        firstTransferOutput
      )
      // Add the first AVAX output = the amount to send to the other address
      outputs.push(firstTransferableOutput)

      // add the remainder as output to be sent back to the address
      if (!remainder.isZero()) {
        const remainderTransferOutput = new avm.SECPTransferOutput(
          remainder,
          addresses
        )
        const remainderTransferableOutput = new avm.TransferableOutput(
          avaxIDBuffer,
          remainderTransferOutput
        )
        outputs.push(remainderTransferableOutput)
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
      console.log('Error in sendAvax()')
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

    const avax = flags.avax
    if (isNaN(Number(avax))) {
      throw new Error('You must specify a quantity in AVAX with the -q flag.')
    }

    const sendAddr = flags.sendAddr
    if (!sendAddr || sendAddr === '') {
      throw new Error('You must specify a send-to address with the -a flag.')
    }
    const addrBuffer = this.xchain.parseAddress(sendAddr)
    const isValid = Boolean(addrBuffer)
    if (!isValid) {
      // console.log(sendAddr)
      throw new Error('You must specify a valid avalanche address with the -a flag')
    }

    return true
  }
}

Send.description = 'Send an amount of AVAX'

Send.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' }),
  avax: flags.string({ char: 'q', description: 'Quantity in nAVAX (1 AVAX = 1x10^9 nAvax)' }),
  sendAddr: flags.string({ char: 'a', description: 'AVAX address to send to' }),
  memo: flags.string({ char: 'm', description: 'A memo to attach to the transaction' })
}

module.exports = Send
