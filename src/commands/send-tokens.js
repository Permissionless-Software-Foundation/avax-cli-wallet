/*
  oclif command to send SLP tokens to an address.

  This command is optimized for privacy the same way the 'send' command is. See
  that command for details.

  Spends all token UTXOs for the same token and will send token change to the
  same address the BCH change.

  Basic workflow of sending an SLP token:
  - Inputs:
    - token Id, amount, input token UTXOs, input BCH payment UTXO, token output addr, token change addr, bch change addr
    - Note: All UTXOs for the same token should be spent. This will consolidate token UTXOs.
  - Validate inputs
  - Convert token quantities into their base denomination (satoshis) with BigNumber lib.
  - Generate the OP_RETURN transaction
*/

'use strict'

const GetAddress = require('./get-address')
const UpdateBalances = require('./update-balances')
const Send = require('./send')

const { Avalanche, BinTools, BN } = require('avalanche')
const avm = require('avalanche/dist/apis/avm')

const AppUtils = require('../util')
const appUtils = new AppUtils()

// Used for debugging and error reporting.
const util = require('util')
util.inspect.defaultOptions = { depth: 2 }

const { Command, flags } = require('@oclif/command')

class SendTokens extends Command {
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
  }

  async run () {
    try {
      const { flags } = this.parse(SendTokens)

      // Ensure flags meet qualifiying critieria.
      this.validateFlags(flags)

      const name = flags.name // Name of the wallet.
      const qty = flags.qty // Amount to send in token.
      const sendToAddr = flags.sendAddr // The address to send to.
      const tokenId = flags.tokenId // token ID.
      if (!flags.memo) {
        flags.memo = ''
      }

      // Open the wallet data file.
      const filename = `${__dirname}/../../wallets/${name}.json`
      let walletInfo = appUtils.openWallet(filename)

      // Update balances before sending.
      walletInfo = await this.updateBalances.updateBalances(flags)

      // Get a list of token UTXOs from the wallet for this token.
      const tokenUtxos = this.getTokenUtxos(tokenId, walletInfo)

      // Instatiate the Send class so this function can reuse its selectUTXO() code.
      const avaxUtxo = await this.send.selectUTXO(0.001, walletInfo.avaxUtxos)
      console.log(`avaxUtxo ${JSON.stringify(avaxUtxo, null, 2)}`)
      // Exit if there is no UTXO big enough to fulfill the transaction.
      if (!avaxUtxo.amount) {
        this.log('Could not find a UTXO big enough for this transaction. More avax needed.')
        throw new Error('Could not find a UTXO big enough for this transaction')
      }

      // Generate a new address, for sending change to.
      const getAddress = new GetAddress()
      const changeAddress = await getAddress.getAvalancheAddress(filename)

      // Send the token, transfer change to the new address
      const tx = await this.sendTokens(
        avaxUtxo,
        tokenUtxos,
        qty,
        sendToAddr,
        changeAddress,
        walletInfo,
        flags.memo
      )

      const txid = await this.appUtils.broadcastAvaxTx(tx)

      this.appUtils.displayAvaxTxid(txid)
      return txid
    } catch (err) {
      console.log('Error in send-tokens.js/run(): ', err)
      return 0
    }
  }

  // Generates the SLP transaction in hex format, ready to broadcast to network.
  async sendTokens (avaxUtxo, tokenUtxos, qty, sendToAddr, changeAddress, walletInfo, memo) {
    try {
      sendToAddr = this.xchain.parseAddress(sendToAddr)
      changeAddress = this.xchain.parseAddress(changeAddress)

      if (tokenUtxos.length === 0) {
        throw new Error('At least one utxo with tokens must be provided')
      }

      // Generate a KeyChain from the change address.
      let xkeyChain = this.appUtils.changeAvalancheAddress(walletInfo, avaxUtxo.hdIndex)
      // add all the keys for the addresses with tokens
      for (let i = 0; i < tokenUtxos.length; i++) {
        const thisUTXO = tokenUtxos[i]
        const kc = this.appUtils.changeAvalancheAddress(walletInfo, thisUTXO.hdIndex)
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

      // calculate remainder token quantity
      const { denomination } = await this.xchain.getAssetDescription(assetIDBuffer)
      qty = qty * Math.pow(10, denomination)
      const qtyToSend = new this.BN(qty)
      const remainderTokens = tokenAmount.sub(qtyToSend)

      if (remainderTokens.isNeg()) {
        throw new Error('Not enough tokens in the selected utxos')
      }

      // get the desired outputs for the transaction
      const outputs = []
      const tokenTransferOutput = new this.avm.SECPTransferOutput(
        qtyToSend,
        [sendToAddr]
      )
      const tokenTransferableOutput = new this.avm.TransferableOutput(
        assetIDBuffer,
        tokenTransferOutput
      )
      outputs.push(tokenTransferableOutput)

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

      // add the remaining tokens as output to be sent back to the address
      if (!remainderTokens.isZero()) {
        const remainderTransferOutput = new this.avm.SECPTransferOutput(
          remainderTokens,
          [changeAddress]
        )
        const remainderTransferableOutput = new this.avm.TransferableOutput(
          assetIDBuffer,
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
      console.log('Error in send-token.js/sendTokens()')
      throw err
    }
  }

  // Retrieve UTXOs associated with the user-specified token. Throws an error
  // if no UTXOs for that token can be found.
  getTokenUtxos (assetID, walletInfo) {
    try {
      if (!walletInfo.otherUtxos) {
        walletInfo.otherUtxos = []
      }

      // Create an array of the UTXOs in the wallet
      // that are associated with the target token.
      let tokenUtxos = walletInfo.otherUtxos.map(thisAddr => {
        const utxos = []
        for (let i = 0; i < thisAddr.utxos.length; i++) {
          const thisUTXO = thisAddr.utxos[i]
          if (thisUTXO.assetID === assetID && thisUTXO.typeID === 7) {
            utxos.push({ ...thisUTXO, hdIndex: thisAddr.hdIndex })
          }
        }
        return utxos
      })

      // Flatten the array.
      tokenUtxos = tokenUtxos.flat()

      if (tokenUtxos.length === 0) {
        throw new Error('No tokens in the wallet matched the given token ID.')
      }

      return tokenUtxos
    } catch (err) {
      this.log('Error in send-token.js/getTokenUtxos().')
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

    return true
  }
}

SendTokens.description = 'Send avalanche native tokens (ANT).'

SendTokens.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' }),
  tokenId: flags.string({ char: 't', description: 'Token ID' }),
  memo: flags.string({ char: 'm', description: 'Memo field' }),
  sendAddr: flags.string({
    char: 'a',
    description: 'Avalache address to send tokens to'
  }),
  qty: flags.string({ char: 'q', decription: 'Quantity of tokens to send' })
}

module.exports = SendTokens
