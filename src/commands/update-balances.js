/*
  oclif command to update the balances stored in the wallet.json file.

  Command Workflow:
  - validateFlags() validates the flags passed into the command.
  - updateBalances() is the parent function that kicks off this command.
    - getAllAddressData() queries data on all addresses generated by the wallet.
      - getAddressData() get balance data and the UTXO on a block of 20 addresses
      - getUTXOs() get all the UTXOs for a block of 20 addresses
      - filterUtxos() segregate the UTXOs with avax from all the other UTXOs
    - displayTokenBalances() displays avalanche token info on the console.
    - saveWallet() saves the data to the wallet file.
*/

'use strict'

const collect = require('collect.js')

const AppUtils = require('../util')
const appUtils = new AppUtils()

// const globalConfig = require('../../config')

const { Avalanche, BinTools } = require('avalanche')

const { Command, flags } = require('@oclif/command')

class UpdateBalances extends Command {
  constructor (argv, config) {
    super(argv, config)

    // Default libraries.
    // this.ava = new Avalanche(globalConfig.AVAX_IP, parseInt(globalConfig.AVAX_PORT))
    this.ava = new Avalanche('api.avax.network', 443, 'https')
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

    const addressData = await this.getAllAddressData(walletInfo)

    // Cut down on screen spam when running unit tests.
    // Summarize token balances
    this.displayTokenBalances(addressData.balances)

    const addresses = this.updateAddresses(walletInfo, addressData.balances)

    walletInfo.balances = addressData.balances
    walletInfo.avaxAmount = addressData.navaxAmount / Math.pow(10, 9) // 9 can't be hardcoded forever
    walletInfo.avaxUtxos = addressData.avaxUtxos
    walletInfo.otherUtxos = addressData.otherUtxos
    walletInfo.addresses = addresses

    await this.appUtils.saveWallet(filename, walletInfo)
    return walletInfo
  }

  displayTokenBalances (balances) {
    try {
      // Create an array of just token IDs
      let assetIds = balances.map(x => x.assets.map(y => y.assetID))

      // Flatten the array.
      assetIds = assetIds.flat()

      // Create a unique collection of tokenIds
      const collection = collect(assetIds)
      let unique = collection.unique()
      unique = unique.toArray()

      this.log(' ')
      this.log('Avalanche Token Summary:')
      this.log('Balance Name TokenID')

      // Loop through each unique tokenID.
      for (let i = 0; i < unique.length; i++) {
        const thisAssetId = unique[i]
        let symbol = ''
        let denomination = 1

        let total = 0

        // Loop through each address.
        for (let j = 0; j < balances.length; j++) {
          // Loop through each balance in the current address.
          // If it matches, the current asset ID, add it to the total.
          for (let k = 0; k < balances[j].assets.length; k++) {
            const thisAsset = balances[j].assets[k]

            // If the token Ids match
            if (thisAsset.assetID === thisAssetId.toString()) {
              // Add the token quantity to the total.
              total += parseFloat(thisAsset.amount)
              symbol = thisAsset.symbol
              denomination = thisAsset.denomination
            }
          }
        }

        // Write out summary info to the console.
        total = total / Math.pow(10, denomination)
        this.log(`${total.toString().padStart(7)} ${symbol.padStart(4)} ${thisAssetId}`)
      }
      this.log(' ')
    } catch (err) {
      console.log('Error in update-balances.js/displayTokenBalances()')
      throw err
    }
  }

  // Retrieves data for every address generated by the wallet.
  // Returns an array of address data for every address generated by the wallet.
  async getAllAddressData (walletInfo) {
    const limit = 10
    try {
      let balances = [] // Accumulates addresses balance.
      let otherUtxos = [] // Accumulates SLP token UTXOs.
      let avaxUtxos = [] // Accumulates BCH (non-SLP) UTXOs.
      let navaxAmount = 0
      let currentIndex = 0 // tracks the current HD index.
      let batchHasBalance = true // Flag to signal when last address found.

      // Scan the derivation path of addresses until a block of 20 is found that
      // contains no balance. This follows the standard BIP45 specification.
      while (batchHasBalance || currentIndex < walletInfo.nextAddress) {
        // while (batchHasBalance || currentIndex < 60) {
        // Get a 20-address batch of data.
        const thisDataBatch = await this.getAddressData(walletInfo, currentIndex, limit)

        // Increment the index by limit (addresses).
        currentIndex += limit

        // Check if data has no balance. no balance == last address.
        batchHasBalance = this.detectBalance(thisDataBatch.balances)

        // Add data to the array, unless this last batch has no balances.
        if (batchHasBalance) {
          balances = balances.concat(thisDataBatch.balances)
          otherUtxos = otherUtxos.concat(thisDataBatch.otherUtxos)
          avaxUtxos = avaxUtxos.concat(thisDataBatch.avaxUtxos)
          navaxAmount += thisDataBatch.navaxAmount
        }

        // Protect against run-away while loop.
        if (currentIndex > 10000) break
      }

      return { balances, otherUtxos, avaxUtxos, navaxAmount }
    } catch (err) {
      console.log('Error in update-balances.js/getAllAddressData()')
      throw err
    }
  }

  // Retrieves details data (objects) on addresses in an HD wallet
  // A max of 20 addresses can be retrieved at a time.
  // Addresses start at the index and the number of address data retrieved is
  // set by the limit (up to 20). Data is returned as an object with balance and
  // hydrated utxo data.
  async getAddressData (walletInfo, index, limit) {
    try {
      if (isNaN(index)) throw new Error('index must be supplied as a number.')

      if (!limit || isNaN(limit)) {
        throw new Error('limit must be supplied as a non-zero number.')
      }

      if (limit > 20) throw new Error('limit must be 20 or less.')
      // console.log(' ')
      console.log(`Getting address data at index ${index} up to index ${index + limit}`)

      // Get the list of addresses.
      const addresses = this.appUtils.generateAvalancheAddress(
        walletInfo,
        index,
        limit
      )

      // get AVAX balance and details for each address.
      const balances = []
      const avaxBuffer = await this.xchain.getAVAXAssetID()
      const avaxAssetDescription = await this.xchain.getAssetDescription(avaxBuffer)
      let navaxAmount = 0

      for (let i = 0; i < addresses.length; i++) {
        const addr = addresses[i]
        const hdIndex = i + index
        const balance = await this.getAddressBalances(addr, avaxAssetDescription, hdIndex)

        if (!balance.assets.length) {
          continue
        }

        balances.push(balance)

        navaxAmount += balance.navaxAmount
      }

      // Get UTXO data.
      const { utxos: utxoSet } = await this.xchain.getUTXOs(addresses)
      const utxos = utxoSet.getAllUTXOs()

      // segregate UTXOs by address
      const uxtosByIndex = []
      for (let i = 0; i < addresses.length; i++) {
        const hdIndex = i + index
        const addr = addresses[i]
        const addrBuffer = this.xchain.parseAddress(addr)
        const thisUtxo = utxos.filter(item => {
          return item.getOutput().getAddressIdx(addrBuffer) >= 0 && item.getOutput().getTypeID() < 10
        })
        // Cut down on screen spam when running unit tests.
        // if (process.env.TEST !== 'unit') {
        //   const firstBit = addr.slice(0, -4)
        //   const lastbit = addr.slice(-4)
        //   console.log(index + i, `${firstBit}\x1b[36m${lastbit}\x1b[0m`, `utxos: ${thisUtxo.length}`)
        // }
        uxtosByIndex.push({ address: addr, hdIndex, utxos: thisUtxo })
      }

      // Filter out the UTXOs.
      const { avaxUtxos, otherUtxos } = await this.filterUtxos(
        uxtosByIndex, avaxBuffer.toString('hex')
      )

      return { balances, avaxUtxos, otherUtxos, navaxAmount }
    } catch (err) {
      // console.log('Error: ', err)
      console.log('Error in update-balances.js/getAddressData()')
      throw err
    }
  }

  async getAddressBalances (address, avaxAssetDescription, hdIndex) {
    try {
      const assetsBalance = await this.xchain.getAllBalances(address)

      let navaxAmount = 0
      if (assetsBalance.length === 0) {
        return { address, hdIndex, navaxAmount, assets: [] }
      }

      if (!avaxAssetDescription) {
        const avaxBuffer = await this.xchain.getAVAXAssetID()
        avaxAssetDescription = await this.xchain.getAssetDescription(avaxBuffer)
      }

      const promises = []
      for (const asset of assetsBalance) {
        if (asset.asset === 'AVAX') {
          // add default avax asset description to the array
          promises.push(avaxAssetDescription)
          continue
        }
        // push the other assets to fetch their description
        promises.push(this.xchain.getAssetDescription(asset.asset))
      }

      const details = await Promise.all(promises)
      const assets = []
      for (let index = 0; index < assetsBalance.length; index++) {
        const { asset, balance, ...assetItem } = assetsBalance[index]
        const assetDetail = details[index]

        assetItem.assetID = asset
        assetItem.name = assetDetail.name
        assetItem.symbol = assetDetail.symbol
        assetItem.denomination = assetDetail.denomination
        assetItem.amount = parseInt(balance)

        if (asset === 'AVAX') {
          assetItem.assetID = this.bintools.cb58Encode(assetDetail.assetID)
          navaxAmount = assetItem.amount
        }
        assets.push(assetItem)
      }

      return { address, hdIndex, navaxAmount, assets }
    } catch (err) {
      console.log('Error in update-balances.js/getAddressBalances():', hdIndex)
      throw err
    }
  }

  /**
   * Expects an array of utxo objects and returns two filtered lists. One of
   * AVAX-only UTXOs and the other of non-AVAX utxos
   * it also formats them
   * @param {Object[]} utxoObjs
   * @param {string} utxoObjs.address
   * @param {number} utxoObjs.hdIndex
   * @param {UTXO[]} utxoObjs.utxos
   * @param {string} avaxHex
   */
  filterUtxos (utxoObjs, avaxHex) {
    try {
      let avaxUtxos = []
      let otherUtxos = []

      if (!utxoObjs || !Array.isArray(utxoObjs)) {
        throw new Error('utxoObjs must be an array')
      }

      if (typeof avaxHex !== 'string' || !avaxHex.length) {
        throw new Error('avaxHex must be a string')
      }

      for (const thisUtxoObj of utxoObjs) {
        const avaxUtxoObj = {
          address: thisUtxoObj.address,
          hdIndex: thisUtxoObj.hdIndex,
          utxos: []
        }

        const otherUtxoObj = {
          address: thisUtxoObj.address,
          hdIndex: thisUtxoObj.hdIndex,
          utxos: []
        }

        for (const utxo of thisUtxoObj.utxos) {
          const assetID = utxo.getAssetID()
          const isAvaxAsset = assetID.toString('hex') === avaxHex
          const utxoType = utxo.getOutput().getTypeID()
          let amount = 1

          if (utxoType === 7) {
            amount = utxo.getOutput().getAmount().toNumber()
          }

          const formatedUTXO = {
            txid: this.bintools.cb58Encode(utxo.getTxID()),
            outputIdx: utxo.getOutputIdx().toString('hex'),
            amount, // it doesn't contain any decimals, it's a big number
            assetID: this.bintools.cb58Encode(assetID),
            typeID: utxoType
          }

          if (isAvaxAsset) {
            avaxUtxoObj.utxos.push(formatedUTXO)
            continue
          }

          otherUtxoObj.utxos.push(formatedUTXO)
        }

        avaxUtxos.push(avaxUtxoObj)
        otherUtxos.push(otherUtxoObj)
      }

      avaxUtxos = avaxUtxos.filter(item => item.utxos.length > 0)
      otherUtxos = otherUtxos.filter(item => item.utxos.length > 0)
      return { avaxUtxos, otherUtxos }
    } catch (err) {
      console.log('Error in update-balances.js/filterUtxos()')
      throw err
    }
  }

  /**
   * Returns true if any of the address data has a balance.
   * dataBatch is expected to be an array of address data.
   * @param {object} dataBatch
   * @param {string} dataBatch.address
   * @param {number} dataBatch.hdIndex
   * @param {object[]} dataBatch.assets
   */
  detectBalance (dataBatch) {
    for (let i = 0; i < dataBatch.length; i++) {
      const thisAddr = dataBatch[i]

      // Exit if a balance is detected in any of the addresses.
      if (thisAddr.assets.length > 0) {
        return true
      }
    }

    // If the loop completes without finding a balance, return false.
    return false
  }

  updateAddresses (walletInfo, balances) {
    const addresses = { ...walletInfo.addresses }
    for (let i = 0; i < balances.length; i++) {
      const element = balances[i]
      addresses[element.hdIndex] = element.address
    }
    return addresses
  }
}

UpdateBalances.description = 'Poll the network and update the balances of the wallet.'

UpdateBalances.flags = {
  name: flags.string({ char: 'n', description: 'Name of wallet' })
}

module.exports = UpdateBalances
