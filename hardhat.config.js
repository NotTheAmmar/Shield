/**
 * @type import('hardhat/config').HardhatUserConfig
 * @dev Hardhat Configuration for SHIELD EVM blockchain integration.
 *
 * Usage:
 *   npx hardhat compile   — Compiles contracts AND auto-exports ABI to shield-ledger/src/abis/
 *   npx hardhat test      — Runs Solidity unit tests against the built-in Hardhat EVM
 *   npx hardhat node      — Starts a local EVM node at http://127.0.0.1:8545
 *
 * For the private Docker blockchain network, see docker-compose.blockchain.yml.
 */

const fs   = require("fs");
const path = require("path");

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// ── Post-compile ABI Export ────────────────────────────────────────────────
// After every `npx hardhat compile`, this task automatically copies the
// ShieldLedger ABI into shield-ledger/src/abis/ so the backend team always
// has an up-to-date ABI without any manual copy step.
//
// Hardhat v2: TASK_COMPILE is a string constant from builtin-tasks/task-names.
// `task` is a global provided by Hardhat's config loader — no import needed.
const { TASK_COMPILE } = require("hardhat/builtin-tasks/task-names");

task(TASK_COMPILE, "Compiles the entire project and exports ABIs").setAction(
  async (args, hre, runSuper) => {
    // Run the default compile task first
    await runSuper(args);

    const abiOutputDir  = path.join(__dirname, "shield-ledger", "src", "abis");
    fs.mkdirSync(abiOutputDir, { recursive: true });

    const contractsToExport = ["FIRLedger", "EvidenceLedger"];

    for (const contractName of contractsToExport) {
      const artifactPath = path.join(
        __dirname,
        "artifacts",
        "contracts",
        `${contractName}.sol`,
        `${contractName}.json`
      );

      const abiOutputFile = path.join(abiOutputDir, `${contractName}.json`);

      if (!fs.existsSync(artifactPath)) {
        console.log(`\n[ABI Export] ${contractName} artifact not found — skipping ABI export.`);
        continue;
      }

      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      fs.writeFileSync(abiOutputFile, JSON.stringify(artifact.abi, null, 2));
      console.log(`\n[ABI Export] ${contractName}.json written to shield-ledger/src/abis/`);
    }
  }
);

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
    // Built-in Hardhat node (fast, zero-cost, in-process EVM for rapid testing)
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
    },
    // Private SHIELD Docker blockchain network (node-police RPC)
    // Start with: docker compose -f docker-compose.blockchain.yml up -d
    // Requires BLOCKCHAIN_DEPLOYER_PRIVATE_KEY in .env (police node account key)
    localnet: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      gasPrice: 0,           // geth runs with --miner.gasprice 0; no gas cost on this chain
      accounts: (process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY))
        ? [process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY]
        : ["0x0000000000000000000000000000000000000000000000000000000000000001"] // dummy fallback for validation when not deploying
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
