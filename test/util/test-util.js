/*
  A test utility library.
*/

const shell = require('shelljs')

// Restore a the token wallet.
// Used in the update-balances test.
function restoreWallet (network = 'mainnet') {
  // console.log(`__dirname: ${__dirname}`)
  let fileName = 'token-wallet.json'
  if (network === 'testnet') {
    fileName = 'testwallet.json'
  }
  shell.cp(`${__dirname}/../mocks/${fileName}`, `${__dirname}/../../wallets/test123.json`)
}

function restoreAvaxWallet () {
  // console.log(`__dirname: ${__dirname}`)
  shell.cp(`${__dirname}/../mocks/avax-wallet.json`, `${__dirname}/../../wallets/test123.json`)
}

module.exports = {
  restoreAvaxWallet,
  restoreWallet
}
