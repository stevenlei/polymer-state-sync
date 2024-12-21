require("dotenv").config();
const hre = require("hardhat");

async function main() {
  // Get the network name from Hardhat's config
  const networkName = hre.network.name;
  const chainId = hre.network.config.chainId;
  console.log(`Deploying to network: ${networkName} (${chainId})`);

  // Get the Polymer Prover address based on the network
  let polymerProverAddress;
  if (chainId === 11155420) {
    // Optimism Sepolia
    polymerProverAddress =
      process.env.POLYMER_PROVER_OPTIMISM_TESTNET_CONTRACT_ADDRESS;
  } else if (chainId === 84532) {
    // Base Sepolia
    polymerProverAddress =
      process.env.POLYMER_PROVER_BASE_TESTNET_CONTRACT_ADDRESS;
  } else {
    throw new Error("Unsupported network");
  }

  console.log(`Using Polymer Prover address: ${polymerProverAddress}`);

  console.log("Deploying CrossChainStore...");
  const CrossChainStore = await hre.ethers.getContractFactory(
    "CrossChainStore"
  );
  const store = await CrossChainStore.deploy(polymerProverAddress);
  await store.waitForDeployment();

  const address = await store.getAddress();
  console.log(`CrossChainStore deployed to: ${address}`);

  // Wait for a few block confirmations
  console.log("Waiting for confirmations...");
  await store.deploymentTransaction().wait(5);
  console.log("Deployment confirmed!");

  return address;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
