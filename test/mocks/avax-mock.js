const { BinTools } = require('avalanche')
const bintools = BinTools.getInstance()

const avaxString = 'FvwEAhmxKfeiG8SnEvq42hc6whRyY3EFYAvebMqDNDGCgxN5Z'
const avaxID = bintools.cb58Decode(avaxString)

const assets = [
  { asset: 'AVAX', balance: '58000000' },
  {
    asset: '2tEi6r6PZ9VXHogUmkCzvijmW81TRNjtKWnR4FA55zTPc87fxC',
    balance: '89400'
  },
  {
    asset: '2jgTFB6MM4vwLzUNWFYGPfyeQfpLaEqj4XWku6FoW7vaGrrEd5',
    balance: '490'
  }
]

const assetDetails = [
  {
    name: 'Avalanche',
    symbol: 'AVAX',
    assetID: bintools.cb58Decode('FvwEAhmxKfeiG8SnEvq42hc6whRyY3EFYAvebMqDNDGCgxN5Z'),
    denomination: 9
  },
  {
    name: 'Bridge Token',
    symbol: 'BTT',
    assetID: bintools.cb58Decode('2tEi6r6PZ9VXHogUmkCzvijmW81TRNjtKWnR4FA55zTPc87fxC'),
    denomination: 2
  },
  {
    name: 'AREPA TOKEN',
    symbol: 'ARP',
    assetID: bintools.cb58Decode('2jgTFB6MM4vwLzUNWFYGPfyeQfpLaEqj4XWku6FoW7vaGrrEd5'),
    denomination: 2
  }
]

module.exports = {
  assets,
  avaxID,
  assetDetails
}
