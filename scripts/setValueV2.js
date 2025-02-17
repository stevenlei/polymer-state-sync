require("dotenv").config();
const ethers = require("ethers");
const { default: inquirer } = require("inquirer");
const chalk = require("chalk");

const { CHAINS } = require("../config/chains");

// Contract ABI
const CONTRACT_ABI =
  require("../artifacts/contracts/StateSyncV2.sol/StateSyncV2.json").abi;

async function main() {
  // Create wallet from private key
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  console.log(
    chalk.cyan(`👛 Using wallet address: ${chalk.bold(wallet.address)}`)
  );

  // Get user input
  console.log(chalk.blue("\n📝 Please provide the following information:"));
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "chain",
      message: "Select a chain:",
      choices: Object.entries(CHAINS).map(([key, value]) => ({
        name: value.name,
        value: key,
      })),
    },
    {
      type: "input",
      name: "key",
      message: "Enter the key:",
      validate: (input) => {
        if (!input.trim()) {
          return "Key cannot be empty";
        }
        return true;
      },
    },
    {
      type: "input",
      name: "value",
      message: "Enter the value:",
      validate: (input) => {
        if (!input.trim()) {
          return "Value cannot be empty";
        }
        return true;
      },
    },
  ]);

  // Validate environment variables
  const requiredEnvVars = ["PRIVATE_KEY"];

  requiredEnvVars.push(
    `${answers.chain.toUpperCase().replace("-", "_")}_CONTRACT_ADDRESS`
  );
  requiredEnvVars.push(`${answers.chain.toUpperCase().replace("-", "_")}_RPC`);

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing environment variable: ${envVar}`);
    }
  }

  // Get chain configurations
  const chainConfig = CHAINS[answers.chain];

  console.log(chalk.blue("\n📝 Transaction Details:"));
  console.log(chalk.cyan(`>  Chain: ${chainConfig.name}`));
  console.log(chalk.cyan(`>  Key: ${answers.key}`));
  console.log(chalk.cyan(`>  Value (utf8): ${answers.value}`));

  const bytesValue = ethers.toUtf8Bytes(answers.value);
  console.log(
    chalk.cyan(`>  Value (bytes): 0x${Buffer.from(bytesValue).toString("hex")}`)
  );

  // Confirm transaction
  const confirmation = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "Do you want to proceed with this transaction?",
      default: false,
    },
  ]);

  if (!confirmation.proceed) {
    console.log("Transaction cancelled");
    return;
  }

  try {
    // Setup provider and contract
    console.log(chalk.yellow(`\n🔄 Connecting to ${chainConfig.name}...`));
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    console.log(chalk.green(`✅ Connected to ${chainConfig.name}`));
    const connectedWallet = wallet.connect(provider);
    const contract = new ethers.Contract(
      chainConfig.contractAddress,
      CONTRACT_ABI,
      connectedWallet
    );
    console.log(chalk.green("✅ Contract instance created"));

    // Convert value to bytes
    const valueBytes = ethers.toUtf8Bytes(answers.value);

    // Estimate gas
    console.log(chalk.yellow("\n⛽️ Estimating gas..."));
    const estimatedGas = await contract.setValue.estimateGas(
      answers.key,
      valueBytes
    );

    console.log(
      chalk.cyan(`>  Estimated gas: ${chalk.bold(estimatedGas.toString())}`)
    );

    // Send transaction
    console.log(chalk.yellow("\n🚀 Sending transaction..."));
    const tx = await contract.setValue(answers.key, valueBytes, {
      gasLimit: estimatedGas,
    });
    console.log(chalk.green("✅ Transaction sent"));

    console.log(chalk.cyan(`>  Tx hash: ${tx.hash}`));
    console.log(chalk.yellow("\n⏳ Waiting for confirmation..."));
    const receipt = await tx.wait();
    console.log(chalk.green("🎉 Value set successfully!"));
    console.log(
      chalk.green(
        `✅ Transaction confirmed! Gas used: ${receipt.gasUsed.toString()}`
      )
    );

    // Find the ValueSet event
    const valueSetEvent = receipt.logs.find(
      (log) => log.fragment?.name === "ValueSet"
    );

    if (valueSetEvent) {
      const { sender, key, value, nonce, hashedKey, version } = valueSetEvent.args;

      console.log(chalk.blue("\n📝 Event Details:"));
      console.log(chalk.cyan(`>  Sender: ${sender}`));
      console.log(chalk.cyan(`>  Key: ${key}`));
      console.log(chalk.cyan(`>  Value: ${ethers.toUtf8String(value)}`));
      console.log(chalk.cyan(`>  Nonce: ${nonce}`));
      console.log(chalk.cyan(`>  HashedKey: ${hashedKey}`));
      console.log(chalk.cyan(`>  Version: ${version}`));

      // Also log the OnlyTopics event if found
      const onlyTopicsEvent = receipt.logs.find(
        log => log.fragment?.name === "OnlyTopics"
      );
      if (onlyTopicsEvent) {
        console.log(chalk.blue("\n📝 OnlyTopics Event Details:"));
        console.log(chalk.cyan(`>  Sender: ${onlyTopicsEvent.args.sender}`));
        console.log(chalk.cyan(`>  HashedKey: ${onlyTopicsEvent.args.hashedKey}`));
        console.log(chalk.cyan(`>  Version: ${onlyTopicsEvent.args.version}`));
      }
    }
  } catch (error) {
    console.error(chalk.red("❌ Error:"), error.message);
    if (error.data) {
      console.error(chalk.red("❌ Error data:"), error.data);
    }
  }
}

main().catch((error) => {
  console.error(chalk.red("❌ Error:"), error);
  process.exit(1);
});
