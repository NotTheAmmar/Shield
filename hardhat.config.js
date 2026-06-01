/**
 * @type import('hardhat/config').HardhatUserConfig
 * @dev Template Hardhat Configuration for Future EVM Integration.
 * 
 * To initialize:
 * 1. npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
 * 2. npx hardhat compile
 * 3. npx hardhat node (runs a local EVM node at http://127.0.0.1:8545)
 */

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Local Hardhat Node for fast, zero-cost E2E test runs
    hardhat: {
      chainId: 1337,
    },
    // Future deployment to a local Ganache or Hardhat network
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
    },
    // Future deployment to Ethereum Sepolia Testnet
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./tests/blockchain", // isolated blockchain-specific unit tests
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
