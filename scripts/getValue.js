require("dotenv").config();
const ethers = require("ethers");
const { default: inquirer } = require("inquirer");

// Chain configurations
const CHAINS = {
  "optimism-sepolia": {
    name: "Optimism Sepolia",
    rpcUrl: process.env.OPTIMISM_SEPOLIA_RPC,
    contractAddress: process.env.OPTIMISM_CONTRACT_ADDRESS,
    chainId: 11155420,
  },
  "base-sepolia": {
    name: "Base Sepolia",
    rpcUrl: process.env.BASE_SEPOLIA_RPC,
    contractAddress: process.env.BASE_CONTRACT_ADDRESS,
    chainId: 84532,
  },
};

// Contract ABI
const CONTRACT_ABI =
  require("../artifacts/contracts/CrossChainStore.sol/CrossChainStore.json").abi;

async function main() {
  // Validate environment variables
  const requiredEnvVars = [
    "PRIVATE_KEY",
    "OPTIMISM_CONTRACT_ADDRESS",
    "BASE_CONTRACT_ADDRESS",
    "OPTIMISM_SEPOLIA_RPC",
    "BASE_SEPOLIA_RPC",
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing environment variable: ${envVar}`);
    }
  }

  // Create wallet from private key
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  console.log(`Using wallet address: ${wallet.address}`);

  // Get user input
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "chain",
      message: "Select the chain to query from:",
      choices: Object.entries(CHAINS).map(([key, chain]) => ({
        name: chain.name,
        value: key,
      })),
    },
    {
      type: "input",
      name: "originalSender",
      message:
        "Enter the original sender address (leave blank to use current address):",
      validate: (input) => {
        if (!input.trim()) {
          return true; // Empty is valid, will use current address
        }
        try {
          // Check if it's a valid address
          const address = ethers.getAddress(input);
          return true;
        } catch (error) {
          return "Invalid Ethereum address";
        }
      },
    },
    {
      type: "input",
      name: "key",
      message: "Enter the key to query:",
      validate: (input) => {
        if (!input.trim()) {
          return "Key cannot be empty";
        }
        return true;
      },
    },
  ]);

  // Get chain configuration
  const chainConfig = CHAINS[answers.chain];

  // Use current wallet address if no sender address provided
  const originalSender = answers.originalSender.trim() || wallet.address;

  console.log("\nQuery Details:");
  console.log(`Chain: ${chainConfig.name}`);
  console.log(`Original Sender: ${originalSender}`);
  console.log(`Key: ${answers.key}`);

  try {
    // Setup provider and contract
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const connectedWallet = wallet.connect(provider);
    const contract = new ethers.Contract(
      chainConfig.contractAddress,
      CONTRACT_ABI,
      connectedWallet
    );

    // Call getValue
    console.log("\nQuerying value...");
    const value = await contract.getValue(originalSender, answers.key);

    // Display results
    console.log("\nResults:");
    console.log(`Raw Value (bytes): 0x${Buffer.from(value).toString("hex")}`);

    try {
      // Try to decode as UTF-8 string
      const decodedValue = ethers.toUtf8String(value);
      console.log(`Decoded Value (UTF-8): ${decodedValue}`);
    } catch (error) {
      console.log("Value could not be decoded as UTF-8 string");
    }

    // Also compute and show the hashedKey
    const hashedKey = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "string"],
        [originalSender, answers.key]
      )
    );
    console.log(`HashedKey: ${hashedKey}`);
  } catch (error) {
    console.error("Error:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
