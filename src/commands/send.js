/*
  oclif command to send BCH to an address.

  The spending of UTXOs is optimized for privacy. The UTXO selected is equal to
  or bigger than the amount specified, but as close to it as possible. Change is
  always sent to a new address.

  This method of selecting UTXOs can leave a lot of dust UTXOs lying around in
  the wallet. It is assumed the user will consolidate the dust UTXOs periodically
  with an online service like Consolidating CoinJoin or CashShuffle, as
  described here:
  https://gist.github.com/christroutner/8d54597da652fe2affa5a7230664bc45
*/

'use strict'

const UpdateBalances = require('./update-balances')
// const globalConfig = require('../../config')

const AppUtils = require('../util')
const appUtils = new AppUtils()
const GetAddress = require('./get-address')

const { Avalanche, BinTools, BN } = require('avalanche')
const avm = require('avalanche/dist/apis/avm')

const { Command, flags } = require('@oclif/command')

class Send extends Command {
  constructor (argv, config) {
    super(argv, config)
    // _this = this

    // this.ava = new Avalanche(globalConfig.AVAX_IP, parseInt(globalConfig.AVAX_PORT))
    this.ava = new Avalanche('api.avax.network', 443, 'https')
    this.bintools = BinTools.getInstance()
    this.xchain = this.ava.XChain()
    this.appUtils = appUtils
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

      // Select optimal UTXO
      const utxo = await this.selectUTXO(avax, walletInfo.avaxUtxos)

      // Exit if there is no UTXO big enough to fulfill the transaction.
      if (!utxo.amount) {
        this.log('Could not find a UTXO big enough for this transaction.')
        throw new Error('Not enough avax in the selected utxo')
      }

      // Generate a new address, for sending change to.
      const getAddress = new GetAddress()
      const changeAddress = await getAddress.getAvalancheAddress(filename)

      // Send the AVAX
      const tx = await this.sendAvax(
        utxo,
        avax,
        sendToAddr,
        changeAddress,
        walletInfo,
        flags.memo
      )

      const txid = await this.appUtils.broadcastAvaxTx(tx)

      this.appUtils.displayAvaxTxid(txid)
      return txid
    } catch (err) {
      console.log('Error in send.js/run(): ', err)
      return 0
    }
  }

  // Sends Avax to
  async sendAvax (utxo, avaxAmount, sendToAddr, changeAddress, walletInfo, memo) {
    try {
      sendToAddr = this.xchain.parseAddress(sendToAddr)
      changeAddress = this.xchain.parseAddress(changeAddress)
      // Generate a KeyChain from the change address.
      const xkeyChain = this.appUtils.avalancheChangeAddress(walletInfo, utxo.hdIndex)

      const avaxIDBuffer = await this.xchain.getAVAXAssetID()
      const { denomination } = await this.xchain.getAssetDescription(avaxIDBuffer)
      const addresses = xkeyChain.getAddresses()

      // encode memo
      const memoBuffer = Buffer.from(memo)

      const fee = this.xchain.getDefaultTxFee()
      const navax = parseFloat(avaxAmount) * Math.pow(10, denomination)
      const navaxToSend = new this.BN(navax)
      const utxoBalance = new this.BN(utxo.amount)
      const remainder = utxoBalance.sub(fee).sub(navaxToSend)

      if (remainder.isNeg()) {
        throw new Error('Not enough avax in the selected utxo')
      }

      const inputs = []
      const transferInput = new this.avm.SECPTransferInput(utxoBalance)
      transferInput.addSignatureIdx(0, addresses[0])

      const txInput = new this.avm.TransferableInput(
        this.bintools.cb58Decode(utxo.txid),
        Buffer.from(utxo.outputIdx, 'hex'),
        avaxIDBuffer,
        transferInput
      )

      inputs.push(txInput)

      // get the desired outputs for the transaction
      const outputs = []
      const firstTransferOutput = new this.avm.SECPTransferOutput(navaxToSend, [sendToAddr])
      const firstOutput = new this.avm.TransferableOutput(avaxIDBuffer, firstTransferOutput)
      // Add the first AVAX output = the amount to send to the other address
      outputs.push(firstOutput)

      // add the remainder as output to be sent back to the change address
      if (!remainder.isZero()) {
        const remainderTransferOutput = new this.avm.SECPTransferOutput(remainder, [changeAddress])
        const remainderOutput = new this.avm.TransferableOutput(avaxIDBuffer, remainderTransferOutput)
        outputs.push(remainderOutput)
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
      throw new Error(
        'You must specify a valid avalanche address with the -a flag'
      )
    }

    return true
  }

  // Selects a UTXO from an array of UTXOs based on this optimization criteria:
  // 1. The UTXO must be larger than or equal to the amount of AVAX to send.
  // 2. The UTXO should be as close to the amount of AVAX as possible.
  //    i.e. as small as possible
  // Returns a single UTXO object.
  async selectUTXO (avax, utxos, isnAvax = false) {
    let candidateUTXO = {}

    const avaxBuffer = await this.xchain.getAVAXAssetID()
    const assetDetail = await this.xchain.getAssetDescription(avaxBuffer)
    const txFee = await this.xchain.getTxFee()
    // 1 nAVAX is equal to 0.000000001 AVAX
    let navax = avax

    if (!isnAvax) {
      navax = parseFloat(avax) * Math.pow(10, assetDetail.denomination)
    }

    const total = navax + txFee.toNumber()
    // if it's a new wallet
    if (!utxos) {
      utxos = []
    }

    // Loop through each address.
    for (var i = 0; i < utxos.length; i++) {
      const thisAddr = utxos[i]

      // Loop through each UTXO for each address.
      for (let j = 0; j < thisAddr.utxos.length; j++) {
        const thisUTXO = Object.assign({}, thisAddr.utxos[j])
        thisUTXO.hdIndex = thisAddr.hdIndex

        // The UTXO must be greater than or equal to the send amount.
        if (thisUTXO.amount < total) {
          continue
        }
        // Automatically assign if the candidateUTXO is an empty object.
        if (!candidateUTXO.amount) {
          candidateUTXO = thisUTXO
          continue
        }

        // Replace the candidate if the current UTXO is closer to the send amount.
        if (candidateUTXO.amount > thisUTXO.amount) {
          candidateUTXO = thisUTXO
        }
      }
    }

    return candidateUTXO
  }
}

Send.description = 'Send an amount of AVAX'

Send.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' }),
  avax: flags.string({
    char: 'q',
    description: 'Quantity in nAVAX (1 AVAX = 1x10^9 nAvax)'
  }),
  sendAddr: flags.string({ char: 'a', description: 'AVAX address to send to' }),
  memo: flags.string({
    char: 'm',
    description: 'A memo to attach to the transaction'
  })
}

module.exports = Send
