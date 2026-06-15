const hre = require("hardhat");

async function main() {
  const ShieldLedger = await hre.ethers.getContractFactory("ShieldLedger");
  const shieldLedger = await ShieldLedger.deploy();
  await shieldLedger.waitForDeployment();
  const address = await shieldLedger.getAddress();

  console.log("ShieldLedger deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
