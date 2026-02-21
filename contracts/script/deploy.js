const hre = require("hardhat");

async function main() {
  console.log("Deploying MeditationReward...");
  
  const MeditationReward = await hre.ethers.getContractFactory("MeditationReward");
  const contract = await MeditationReward.deploy();
  
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  
  console.log("MeditationReward deployed to:", address);
  
  console.log("\nVerify on KUB L2 Testnet Explorer:");
  console.log("https://kublayer2.testnet.kubscan.com/address/" + address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
