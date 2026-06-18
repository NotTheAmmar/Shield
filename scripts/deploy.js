const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const ShieldLedger = await hre.ethers.getContractFactory("ShieldLedger");
  const shieldLedger = await ShieldLedger.deploy();
  await shieldLedger.waitForDeployment();
  const address = await shieldLedger.getAddress();

  console.log("ShieldLedger deployed to:", address);

  // Auto-inject the new contract address into the .env file
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      const regex = /^BLOCKCHAIN_CONTRACT_ADDRESS=.*$/m;
      if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `BLOCKCHAIN_CONTRACT_ADDRESS=${address}`);
      } else {
          envContent += `\nBLOCKCHAIN_CONTRACT_ADDRESS=${address}`;
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log(`Updated .env with BLOCKCHAIN_CONTRACT_ADDRESS=${address}`);
  } else {
      console.warn("No .env file found at root, could not auto-inject address.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
