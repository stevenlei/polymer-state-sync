require("dotenv").config();
const ethers = require("ethers");
const axios = require("axios");
const chalk = require("chalk");

const POLYMER_API_URL = "https://proof.sepolia.polymer.zone";

const { CHAINS, activatedChains } = require("../config/chains");

// Contract ABI (only the events and functions we need)
const CONTRACT_ABI =
  require("../artifacts/contracts/StateSync.sol/StateSync.json").abi;

class ChainListener {
  constructor(chainConfig, wallet) {
    this.config = chainConfig;
    this.provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    this.wallet = wallet.connect(this.provider);
    this.contract = new ethers.Contract(
      chainConfig.contractAddress,
      CONTRACT_ABI,
      this.wallet
    );

    // Keep track of processed events to avoid duplicates
    this.processedEvents = new Set();
  }

  async start() {
    console.log(
      chalk.blue(`>  Starting listener for ${chalk.bold(this.config.name)}...`)
    );
    console.log(
      chalk.cyan(
        `>  Contract address: ${chalk.bold(this.config.contractAddress)}`
      )
    );
    console.log(chalk.cyan(`>  Chain ID: ${chalk.bold(this.config.chainId)}`));

    // Get the latest block
    const latestBlock = await this.provider.getBlockNumber();
    console.log(
      chalk.yellow(`>  Current block number: ${chalk.bold(latestBlock)}`)
    );

    // Listen for ValueSet events
    this.contract.on(
      "ValueSet",
      async (sender, key, value, nonce, hashedKey, version, event) => {
        try {
          // Create a unique event identifier
          const eventId = `${event.log.blockHash}-${event.log.transactionHash}-${event.log.index}`;

          // Skip if we've already processed this event
          if (this.processedEvents.has(eventId)) {
            return;
          }

          // Get the block details
          const block = await this.provider.getBlock(event.log.blockNumber);

          // Wait for the transaction receipt
          const receipt = await event.log.getTransactionReceipt();

          // Get the position in the block
          const positionInBlock = receipt.index;

          console.log(
            chalk.blue(
              `\n🔔 New ValueSet event detected on ${chalk.bold(
                this.config.name
              )}:`
            )
          );
          console.log(chalk.cyan(`>  Sender: ${chalk.bold(sender)}`));
          console.log(chalk.cyan(`>  Key: ${chalk.bold(key)}`));
          console.log(
            chalk.cyan(`>  Value (bytes): ${chalk.bold(ethers.hexlify(value))}`)
          );

          const valueDecoded = ethers.toUtf8String(value);
          console.log(
            chalk.cyan(`>  Value (utf8): ${chalk.bold(valueDecoded)}`)
          );

          console.log(chalk.cyan(`>  Nonce: ${chalk.bold(nonce)}`));
          console.log(chalk.cyan(`>  HashedKey: ${chalk.bold(hashedKey)}`));
          console.log(chalk.cyan(`>  Version: ${chalk.bold(version)}`));
          console.log(
            chalk.cyan(`>  Block Number: ${chalk.bold(event.log.blockNumber)}`)
          );
          console.log(
            chalk.cyan(`>  Block Hash: ${chalk.bold(event.log.blockHash)}`)
          );
          console.log(
            chalk.cyan(
              `>  Transaction Hash: ${chalk.bold(event.log.transactionHash)}`
            )
          );
          console.log(
            chalk.cyan(`>  Log Index: ${chalk.bold(event.log.index)}`)
          );
          console.log(
            chalk.cyan(`>  Position in Block: ${chalk.bold(positionInBlock)}`)
          );
          if (block) {
            console.log(
              chalk.cyan(
                `>  Block Time: ${chalk.bold(
                  new Date(block.timestamp * 1000).toISOString()
                )}`
              )
            );
          }

          try {
            await this.handleValueSetEvent({
              args: {
                sender,
                key,
                value,
                nonce,
                hashedKey,
                version,
              },
              blockHash: event.log.blockHash,
              blockNumber: event.log.blockNumber,
              transactionHash: event.log.transactionHash,
              logIndex: event.log.index,
              positionInBlock,
            });
            this.processedEvents.add(eventId);
          } catch (error) {
            console.error(
              chalk.red("❌ Error handling ValueSet event:"),
              error
            );
          }
        } catch (error) {
          console.error(chalk.red("❌ Error processing event:"), error);
        }
      }
    );
  }

  async handleValueSetEvent(data) {
    // Get all other chains except the source chain
    const otherChains = Object.values(CHAINS).filter(
      (chain) => chain.chainId.toString() !== this.config.chainId.toString()
    );

    if (otherChains.length === 0) {
      console.error("No other chains configured to send proofs to");
      return;
    }

    // Process all chains in parallel
    await Promise.all(
      otherChains.map(async (destinationChain) => {
        try {
          console.log(
            chalk.yellow(
              `\n📤 Submitting proof request to Polymer for ${chalk.bold(
                destinationChain.name
              )}...`
            )
          );
          console.log(
            chalk.cyan(`>  From Chain: ${chalk.bold(this.config.name)}`)
          );

          // Request proof from Polymer API
          console.log(chalk.yellow(`>  Requesting proof from Polymer API...`));
          const proofRequest = await axios.post(
            POLYMER_API_URL,
            {
              jsonrpc: "2.0",
              id: 1,
              method: "receipt_requestProof",
              params: [
                this.config.chainId,
                parseInt(destinationChain.chainId),
                data.blockNumber,
                data.positionInBlock,
              ],
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.POLYMER_API_KEY}`,
              },
            }
          );

          if (proofRequest.status !== 200) {
            throw new Error(
              `Failed to get proof from Polymer API. Status code: ${proofRequest.status}`
            );
          }

          const jobId = proofRequest.data.result;

          console.log(
            chalk.green(
              `✅ Proof requested for ${chalk.bold(
                destinationChain.name
              )}. Job ID: ${chalk.bold(jobId)}`
            )
          );

          // Wait for the proof to be generated
          console.log(
            chalk.yellow(
              `>  Waiting for proof for ${chalk.bold(
                destinationChain.name
              )} to be generated...`
            )
          );

          // Check proof after 10 seconds for the first time, then every 5 seconds
          let proofResponse;
          let attempts = 0;
          const delay = attempts === 0 ? 10000 : 5000;
          while (!proofResponse?.data || !proofResponse?.data?.result?.proof) {
            if (attempts >= 10) {
              throw new Error(
                `Failed to get proof from Polymer API for ${destinationChain.name}`
              );
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
            proofResponse = await axios.post(
              POLYMER_API_URL,
              {
                jsonrpc: "2.0",
                id: 1,
                method: "receipt_queryProof",
                params: [jobId],
              },
              {
                headers: {
                  Authorization: `Bearer ${process.env.POLYMER_API_KEY}`,
                },
              }
            );

            console.log(
              `>  Proof status for ${chalk.bold(destinationChain.name)}: ${
                proofResponse.data.result.status
              }...`
            );
            attempts++;
          }

          const proof = proofResponse.data.result.proof;
          console.log(
            chalk.green(
              `✅ Proof received for ${chalk.bold(
                destinationChain.name
              )}. Length: ${chalk.bold(proof.length)} bytes`
            )
          );

          const proofInBytes = `0x${Buffer.from(proof, "base64").toString(
            "hex"
          )}`;

          // Setup destination chain contract
          const destinationProvider = new ethers.JsonRpcProvider(
            destinationChain.rpcUrl
          );
          const destinationWallet = this.wallet.connect(destinationProvider);
          const destinationContract = new ethers.Contract(
            destinationChain.contractAddress,
            CONTRACT_ABI,
            destinationWallet
          );

          // Submit proof to destination chain
          console.log(
            chalk.cyan(
              `\n📤 Submitting proof to ${chalk.bold(destinationChain.name)}...`
            )
          );

          // Estimate gas
          const estimatedGas =
            await destinationContract.setValueFromSource.estimateGas(
              0,
              proofInBytes
            );

          console.log(
            chalk.cyan(
              `>  Estimated gas for ${chalk.bold(
                destinationChain.name
              )}: ${chalk.bold(estimatedGas.toString())}`
            )
          );

          const tx = await destinationContract.setValueFromSource(
            0,
            proofInBytes,
            {
              gasLimit: estimatedGas,
            }
          );

          console.log(
            chalk.green(
              `⏳ Transaction sent to ${chalk.bold(
                destinationChain.name
              )}: ${chalk.bold(tx.hash)}`
            )
          );

          const receipt = await tx.wait();
          console.log(
            chalk.green(
              `✅ Transaction confirmed on ${chalk.bold(
                destinationChain.name
              )}! Gas used: ${chalk.bold(receipt.gasUsed.toString())}`
            )
          );
        } catch (error) {
          console.error(
            chalk.red(
              `❌ Error processing chain ${chalk.bold(destinationChain.name)}:`
            ),
            error
          );
        }
      })
    );
  }
}

async function main() {
  // Validate environment variables
  const requiredEnvVars = [
    "PRIVATE_KEY",
    ...activatedChains.map(
      (chainKey) =>
        `${chainKey.toUpperCase().replace("-", "_")}_CONTRACT_ADDRESS`
    ),
    ...activatedChains.map(
      (chainKey) => `${chainKey.toUpperCase().replace("-", "_")}_RPC`
    ),
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing environment variable: ${envVar}`);
    }
  }

  console.log(chalk.blue("🔄 Initializing chain listeners..."));
  console.log(chalk.cyan(`>  Watching for events...`));

  // Create wallet from private key
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  console.log(
    chalk.cyan(
      `>  Using wallet address (Pay for cross-chain gas): ${chalk.bold(
        wallet.address
      )}`
    )
  );

  // Create listeners for each chain
  const listeners = [];
  for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
    console.log(
      chalk.yellow(
        `\n🎯 Setting up listener for ${chalk.bold(chainConfig.name)}...`
      )
    );
    const listener = new ChainListener(chainConfig, wallet);
    listeners.push(listener);
    await listener.start();
  }

  console.log(chalk.green("\n✅ All listeners started successfully"));
  console.log(chalk.blue("👀 Watching for events..."));
}

// Handle errors
process.on("unhandledRejection", (error) => {
  console.error(chalk.red("❌ Unhandled promise rejection:"), error);
});

main().catch((error) => {
  console.error(chalk.red("❌ Error:"), error);
  process.exit(1);
});
