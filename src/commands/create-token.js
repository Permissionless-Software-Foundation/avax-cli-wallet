/*
  Creates a new ANT in the X-Chain, giving the minting rights as well as
  the initial amount to a newly generated change address, or a given address
*/

'use strict'

const AppUtils = require('../util')
const appUtils = new AppUtils()

const GetAddress = require('./get-address')
const UpdateBalances = require('./update-balances')
const Send = require('./send')

const globalConfig = require('../../config')
const { Avalanche, BN, BinTools } = require('avalanche')
const avm = require('avalanche/dist/apis/avm')

// Mainnet by default
const { Command, flags } = require('@oclif/command')

const fs = require('fs')

// let this

class CreateToken extends Command {
  constructor (argv, config) {
    super(argv, config)
    this.appUtils = appUtils

    this.fs = fs
    this.localConfig = globalConfig

    this.ava = new Avalanche('api.avax.network', 443, 'https')
    this.bintools = BinTools.getInstance()
    this.xchain = this.ava.XChain()
    this.avm = avm
    this.BN = BN

    this.getAddress = new GetAddress()
    this.updateBalances = new UpdateBalances(undefined)
    this.send = new Send()
  }

  async run () {
    try {
      const { flags } = this.parse(CreateToken)

      // Ensure flags meet qualifiying critieria.
      this.validateFlags(flags)

      // Open the wallet data file.
      const filename = `${__dirname}/../../wallets/${flags.name}.json`
      let walletInfo = appUtils.openWallet(filename)

      walletInfo = await this.updateBalances.updateBalances(flags)
      const changeAddr = await this.getAddress.getAvalancheAddress(filename)

      let sendAddr = flags.sendAddr
      // Generate a new address, to send change to if not defined
      if (!sendAddr) {
        sendAddr = changeAddr
      }

      // Instatiate the Send class so this function can reuse its selectUTXO() code.
      const avaxUtxo = await this.send.selectUTXO(0.01, walletInfo.avaxUtxos)

      if (!avaxUtxo.amount) {
        this.log('Could not find a UTXO big enough for this transaction. More avax needed.')
        throw new Error('Could not find a UTXO big enough for this transaction')
      }

      const tx = await this.createToken(walletInfo, avaxUtxo, changeAddr, sendAddr, flags)
      const txid = await this.appUtils.broadcastAvaxTx(tx)
      this.appUtils.displayAvaxTxid(txid)
      return txid
    } catch (err) {
      console.log('Error in create-wallet.js/run(): ', err)

      return 0
    }
  }

  async createToken (walletInfo, avaxUtxo, changeAddr, sendAddr, tokenInfo) {
    try {
      const avaxIDBuffer = await this.xchain.getAVAXAssetID()

      const { token: name, symbol, denomination, memo = '', initial } = tokenInfo
      const memoBuffer = Buffer.from(memo)
      changeAddr = this.xchain.parseAddress(changeAddr)
      sendAddr = this.xchain.parseAddress(sendAddr)

      /// Generate a KeyChain from the address with the avax utxo.
      const xkeyChain = this.appUtils.avalancheChangeAddress(walletInfo, avaxUtxo.hdIndex)

      const fee = this.xchain.getCreationTxFee()
      const avaxAmount = new this.BN(avaxUtxo.amount)
      const remainder = avaxAmount.sub(fee)
      if (remainder.isNeg()) {
        throw new Error('Not avax to pay the transaction fees')
      }

      // set the inputs
      const inputs = []

      const transferInput = new this.avm.SECPTransferInput(avaxAmount)
      const [utxoAddr] = xkeyChain.getAddresses()
      transferInput.addSignatureIdx(0, utxoAddr)
      const txInput = new this.avm.TransferableInput(
        this.bintools.cb58Decode(avaxUtxo.txid),
        Buffer.from(avaxUtxo.outputIdx, 'hex'),
        avaxIDBuffer,
        transferInput
      )
      inputs.push(txInput)

      // set the outputs and the minting values
      const D = Math.pow(10, denomination)
      const initialInt = initial * D
      const amount = new this.BN(initialInt)
      const capSecpOutput = new this.avm.SECPTransferOutput(amount, [sendAddr])
      const secpMintOutput = new this.avm.SECPMintOutput([sendAddr])

      const initialStates = new this.avm.InitialStates()
      initialStates.addOutput(capSecpOutput)
      initialStates.addOutput(secpMintOutput)

      const outputs = []
      if (!remainder.isZero()) {
        const remainderTransferable = new this.avm.SECPTransferOutput(remainder, [changeAddr])
        const remainderOutput = new this.avm.TransferableOutput(avaxIDBuffer, remainderTransferable)
        outputs.push(remainderOutput)
      }

      const createAssetTx = new this.avm.CreateAssetTx(
        this.ava.getNetworkID(),
        this.bintools.cb58Decode(this.xchain.getBlockchainID()),
        outputs,
        inputs,
        memoBuffer,
        name,
        symbol,
        denomination,
        initialStates
      )

      const unsignedTx = new this.avm.UnsignedTx(createAssetTx)
      return unsignedTx.sign(xkeyChain)
    } catch (err) {
      console.log('Error in utils.js/createToken()', err)
      throw err
    }
  }

  // Validate the proper flags are passed in.
  validateFlags (flags) {
    const name = flags.name
    if (typeof name !== 'string' || !name.length) {
      throw new Error('You must specify a wallet with the -n flag.')
    }

    const token = flags.token
    if (typeof token !== 'string' || !token.length) {
      throw new Error('You must specify a token name with the -t flag.')
    }

    const symbol = flags.symbol
    if (typeof symbol !== 'string' || !symbol.length || symbol > 4) {
      throw new Error(
        'You must specify a ticker symbol with the -s flag. (max 4 characters).'
      )
    }

    const denomination = flags.denomination
    if (
      typeof denomination !== 'number' ||
      denomination < 0 ||
      denomination > 32
    ) {
      throw new Error(
        'You must specify a token denomination with the -d flag (it must be >= 0 and <= 32).'
      )
    }

    const initial = flags.initial
    if (typeof initial !== 'number' || initial < 0) {
      throw new Error(
        'You must specify an initial minting quantity with the -q flag. (higher than 0)'
      )
    }

    const sendAddr = flags.sendAddr
    const addrBuffer = this.xchain.parseAddress(sendAddr)
    const isValid = Boolean(addrBuffer)
    if (sendAddr.length && !isValid) {
      throw new Error(
        'You must specify a valid avalanche address with the -a flag'
      )
    }

    return true
  }
}

CreateToken.description = 'Create a brand new ANT.'

CreateToken.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' }),
  token: flags.string({
    char: 't',
    description: 'the descriptive name of the asset'
  }),
  symbol: flags.string({
    char: 's',
    description: 'The ticker symbol of the asset'
  }),
  denomination: flags.integer({
    char: 'd',
    description:
      'the token denomination, which is 10^D. D must be >= 0 and <= 32 (default=9)',
    // default to 9 like avax
    default: 9
  }),
  initial: flags.integer({
    char: 'q',
    description:
      '(optional) the initial amount to be minted with the genesis transaction',
    default: 0
  }),
  memo: flags.string({
    char: 'm',
    description: '(optional) memo to attach to the transaction',
    default: ''
  }),
  sendAddr: flags.string({
    char: 'a',
    description:
      '(optional) optional address to send the mint utxo and the tokens to',
    default: ''
  })
}

module.exports = CreateToken
