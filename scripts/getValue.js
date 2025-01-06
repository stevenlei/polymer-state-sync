require("dotenv").config();
const ethers = require("ethers");
const { default: inquirer } = require("inquirer");
const chalk = require("chalk");

const { CHAINS } = require("../config/chains");

// Contract ABI
const CONTRACT_ABI =
  require("../artifacts/contracts/StateSync.sol/StateSync.json").abi;

async function main() {
  // Create wallet from private key
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  console.log(
    chalk.cyan(`👛 Using wallet address: ${chalk.bold(wallet.address)}`)
  );

  // Get user input
  console.log(chalk.blue("\n📝 Please provide the following information:"));
  const answers = await inquirer.prompt([
    // {
    //   type: "input",
    //   name: "originalSender",
    //   message:
    //     "Enter the original sender address (leave blank to use current address):",
    //   validate: (input) => {
    //     if (!input.trim()) {
    //       return true; // Empty is valid, will use current address
    //     }
    //     try {
    //       // Check if it's a valid address
    //       const address = ethers.getAddress(input);
    //       return true;
    //     } catch (error) {
    //       return "Invalid Ethereum address";
    //     }
    //   },
    // },
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

  // Use current wallet address if no sender address provided
  const originalSender = wallet.address;

  console.log(chalk.blue("\n📝 Query Details:"));
  console.log(chalk.cyan(`>  Original Sender: ${originalSender}`));
  console.log(chalk.cyan(`>  Key: ${answers.key}`));

  // Query all chains in parallel
  console.log(chalk.yellow("\n🔄 Querying all chains..."));

  const results = await Promise.all(
    Object.entries(CHAINS).map(async ([chainKey, chainConfig]) => {
      try {
        // Validate required environment variables for this chain
        const requiredEnvVars = [
          `${chainKey.toUpperCase().replace("-", "_")}_CONTRACT_ADDRESS`,
          `${chainKey.toUpperCase().replace("-", "_")}_RPC`,
        ];

        for (const envVar of requiredEnvVars) {
          if (!process.env[envVar]) {
            throw new Error(`Missing environment variable: ${envVar}`);
          }
        }

        // Setup provider and contract
        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        const contract = new ethers.Contract(
          chainConfig.contractAddress,
          CONTRACT_ABI,
          provider
        );

        // Calculate the hashed key (for display purposes only)
        const hashedKey = ethers.keccak256(
          ethers.solidityPacked(
            ["address", "string"],
            [originalSender, answers.key]
          )
        );

        // Get the value using originalSender and key
        const value = await contract.getValue(originalSender, answers.key);

        // Get the version of the key
        const version = await contract.getKeyVersion(originalSender, answers.key);

        return {
          chain: chainConfig.name,
          hashedKey,
          value,
          version,
          error: null,
        };
      } catch (error) {
        return {
          chain: chainConfig.name,
          hashedKey: null,
          value: null,
          version: null,
          error: error.message,
        };
      }
    })
  );

  // Display results
  console.log(chalk.blue("\n📊 Results:"));
  for (const result of results) {
    console.log(chalk.yellow(`\n${result.chain}:`));
    console.log(chalk.cyan(`>  Chain: ${chalk.bold(result.chain)}`));
    console.log(chalk.cyan(`>  Hashed Key: ${chalk.bold(result.hashedKey)}`));
    if (result.error) {
      console.log(chalk.red(`>  Error: ${result.error}`));
    } else {
      console.log(
        chalk.cyan(
          `>  Value (bytes): ${chalk.bold(ethers.hexlify(result.value))}`
        )
      );
      try {
        const valueDecoded = ethers.toUtf8String(result.value);
        console.log(chalk.cyan(`>  Value (utf8): ${chalk.bold(valueDecoded)}`));
      } catch (error) {
        console.log(
          chalk.yellow(
            `>  Value could not be decoded as UTF-8: ${error.message}`
          )
        );
      }
      console.log(chalk.cyan(`>  Version: ${chalk.bold(result.version)}`));
    }
  }
}

main().catch((error) => {
  console.error(chalk.red("❌ Error:"), error);
  process.exit(1);
});
