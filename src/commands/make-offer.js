/*
  Makes an offer for selling a token on the X-chain DEX.
  This is the first part of a collaborative transaction.
*/

'use strict'

const UpdateBalances = require('./update-balances')
const SendTokens = require('./send-tokens')
const Send = require('./send')

const { Avalanche, BinTools, BN } = require('avalanche')
const avm = require('avalanche/dist/apis/avm')

const AppUtils = require('../util')
const appUtils = new AppUtils()

const { Signature } = require('avalanche/dist/common/credentials')
const createHash = require('create-hash')

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
    this.send = new Send()
  }

  async run () {
    try {
      const { flags } = this.parse(MakeOffer)

      this.validateFlags(flags)

      const {
        amount: tokenAmount,
        avax: avaxAmount,
        tokenId,
        name,
        referece,
        txHex
      } = flags

      // Open the wallet data file.
      const filename = `${__dirname}/../../wallets/${name}.json`
      let walletInfo = appUtils.openWallet(filename)

      // Update balances before sending.
      walletInfo = await this.updateBalances.updateBalances(flags)
      let txInfo = {}

      if (flags.operation === 'sell') {
        txInfo = await this.sell(walletInfo, tokenId, tokenAmount, avaxAmount)
      }

      if (flags.operation === 'buy') {
        txInfo = await this.buy(walletInfo, txHex, referece)
      }

      if (flags.operation === 'accept') {
        txInfo = await this.accept(walletInfo, txHex, referece)
      }

      this.log(`${flags.operation}: ${JSON.stringify(txInfo, null, 2)}`)

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
        const utxoID = utxo.getUTXOID()

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

      const hexString = partialTx.toBuffer().toString('hex')

      return {
        txHex: hexString,
        addrReferences: JSON.stringify(addrReferences)
      }
    } catch (err) {
      console.log('Error in make-offer.js/sell()', err)
      throw err
    }
  }

  async buy (walletInfo, txHex, addrReferences) {
    try {
      const avaxID = await this.xchain.getAVAXAssetID()
      addrReferences = JSON.parse(addrReferences)

      // Parse the old transaction
      const baseTx = new this.avm.BaseTx()
      const txBuffer = Buffer.from(txHex, 'hex')
      baseTx.fromBuffer(txBuffer)

      // handle avax input with optimal avax UTXO
      const outputs = baseTx.getOuts()
      const avaxOut = outputs.find(item => {
        return item.getAssetID().toString('hex') === avaxID.toString('hex')
      })

      const fee = this.xchain.getTxFee()
      const avaxRequired = avaxOut.getOutput().getAmount()
      const avaxUtxo = await this.send.selectUTXO(avaxRequired.toNumber(), walletInfo.avaxUtxos, true)

      if (!avaxUtxo.amount) {
        this.log('Could not find a UTXO big enough for this transaction')
        throw new Error('Not enough avax in the selected utxo')
      }

      const returnAddr = walletInfo.addresses[avaxUtxo.hdIndex]
      const avaxInput = this.appUtils.encodeUtxo(avaxUtxo, returnAddr)
      const utxoID = avaxInput.getUTXOID()
      addrReferences[utxoID] = returnAddr

      // handle token output, referencing the first input as the token input
      const inputs = baseTx.getIns()
      const [tokenInput] = inputs

      const tokenRemainderOut = outputs.find(item => {
        return item.getAssetID().toString('hex') !== avaxID.toString('hex')
      })
      let tokenRemainder = new this.BN(0)
      if (tokenRemainderOut) {
        tokenRemainder = tokenRemainderOut.getOutput().getAmount()
      }

      const tokenAmount = tokenInput.getInput().getAmount().sub(tokenRemainder)
      const assetID = tokenInput.getAssetID()
      const returnAddrBuff = this.xchain.parseAddress(returnAddr)
      const tokenOutput = this.appUtils.generateOutput(tokenAmount, returnAddrBuff, assetID)

      inputs.push(avaxInput)
      outputs.push(tokenOutput)

      // send back the remainding avax if any
      const remainder = new this.BN(avaxUtxo.amount).sub(avaxRequired.add(fee))
      if (remainder.gt(new this.BN(0))) {
        const remainderOut = this.appUtils.generateOutput(remainder, returnAddrBuff, avaxID)
        outputs.push(remainderOut)
      }

      // Build the transcation
      const partialTx = new this.avm.BaseTx(
        this.ava.getNetworkID(),
        this.bintools.cb58Decode(this.xchain.getBlockchainID()),
        outputs,
        inputs,
        Buffer.from('buy offer')
      )

      // Partially sign the tx
      const keyChain = this.appUtils.avalancheChangeAddress(walletInfo, avaxUtxo.hdIndex)
      const unsigned = new this.avm.UnsignedTx(partialTx)

      const signed = this.partialySignTx(
        unsigned,
        keyChain,
        addrReferences
      )
      const hexString = signed.toBuffer().toString('hex')

      return {
        txHex: hexString,
        addrReferences: JSON.stringify(addrReferences)
      }
    } catch (err) {
      console.log('Error in make-offer.js/buy()', err)
      throw err
    }
  }

  async accept (walletInfo, txHex, addrReferences) {
    try {
      addrReferences = JSON.parse(addrReferences)

      // Parse the partially signed transaction
      const halfSignedTx = new this.avm.Tx()
      const txBuffer = Buffer.from(txHex, 'hex')
      halfSignedTx.fromBuffer(txBuffer)

      const credentials = halfSignedTx.getCredentials()
      const unsigned = halfSignedTx.getUnsignedTx()

      let xkeyChain = this.appUtils.avalancheChangeAddress(walletInfo, 0)
      for (let index = 0; index < walletInfo.nextAddress; index++) {
        const kc = this.appUtils.avalancheChangeAddress(walletInfo, index)
        xkeyChain = xkeyChain.union(kc)
      }

      // fully sign the tx
      const signed = this.partialySignTx(
        unsigned,
        xkeyChain,
        addrReferences,
        credentials
      )

      // // check the trasaction was signed
      const newCredentials = signed.getCredentials()
      const hasAllSignatures = newCredentials.every(cred => Boolean(cred.sigArray.length))

      if (!hasAllSignatures) {
        throw new Error('The transaction is not fully signed')
      }
      signed.toBuffer().toString('hex')
      const txid = await this.appUtils.broadcastAvaxTx(signed)
      return { txid }
    } catch (err) {
      console.log('Error in make-offer.js/accept()', err)
      throw err
    }
  }

  /**
   * This method assumes that all the utxos have only one associated address
   * @param {avm.UnsignedTx} tx
   * @param {KeyChain} keychain
   * @param {Object} reference
   * @param {Credential} credentials
   */
  partialySignTx (tx, keychain, reference = {}, oldCredentials = []) {
    const txBuffer = tx.toBuffer()
    const msg = Buffer.from(createHash('sha256').update(txBuffer).digest())
    const credentials = [...oldCredentials]

    const inputs = tx.getTransaction().getIns()
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]
      const cred = this.avm.SelectCredentialClass(input.getInput().getCredentialID())

      const inputid = input.getUTXOID()

      try {
        const source = this.xchain.parseAddress(reference[inputid])
        const keypair = keychain.getKey(source)
        const signval = keypair.sign(msg)
        const sig = new Signature()
        sig.fromBuffer(signval)
        cred.addSignature(sig)

        this.log(`input ${i}: Successfully signed, ( ${inputid} signed with ${reference[inputid]} )`)
        credentials[i] = cred
      } catch (error) {
        this.log(`input ${i}: Skipping, address is not in the keychain, ( ${inputid} )`)

        if (!credentials[i]) {
          credentials[i] = cred
        }
      }
    }
    return new this.avm.Tx(tx, credentials)
  }

  // Validate the proper flags are passed in.
  validateFlags (flags) {
    // Exit if wallet not specified.
    const name = flags.name
    if (typeof name !== 'string' || !name.length) {
      throw new Error('You must specify a wallet with the -n flag')
    }

    const operation = flags.operation
    if (operation === 'sell') {
      const amount = flags.amount
      if (isNaN(Number(amount))) {
        throw new Error('You must specify a token quantity with the -q flag')
      }

      const avax = flags.avax
      if (isNaN(Number(avax))) {
        throw new Error('You must specify an avax quantity with the -a flag')
      }

      const tokenId = flags.tokenId
      if (typeof tokenId !== 'string' || !tokenId.length) {
        throw new Error('You must specifiy the assetID ID with the -t flag')
      }

      return true
    }

    if (operation === 'buy' || operation === 'accept') {
      const txHex = flags.txHex
      if (typeof txHex !== 'string' || !txHex.length) {
        throw new Error('You must specify transaction hex with the -h flag')
      }

      let referece = flags.referece
      if (typeof referece !== 'string' || !referece.length) {
        throw new Error('You must specify the utxos address reference with the -r flag')
      }

      referece = JSON.parse(referece)

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
    description: 'Quantity of tokens to send'
  }),
  avax: flags.integer({
    char: 'a',
    description: 'Quantity of avax to request (must be in nAvax)'
  }),
  operation: flags.string({
    char: 'o',
    description: 'The operation to perform (buy, or sell)'
  }),
  referece: flags.string({
    char: 'r',
    description: 'the address reference as JSON'
  }),
  txHex: flags.string({
    char: 'h',
    description: 'the previous partial transaction encoded as hex'
  })
}

module.exports = MakeOffer
