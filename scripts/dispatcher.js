require("dotenv").config();
const ethers = require("ethers");
const axios = require("axios");

const POLYMER_API_URL = "https://proof.sepolia.polymer.zone";

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

// Contract ABI (only the events and functions we need)
const CONTRACT_ABI =
  require("../artifacts/contracts/CrossChainStore.sol/CrossChainStore.json").abi;

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
    console.log(`Starting listener for ${this.config.name}...`);
    console.log(`Contract address: ${this.config.contractAddress}`);
    console.log(`Chain ID: ${this.config.chainId}`);

    // Get the latest block
    const latestBlock = await this.provider.getBlockNumber();
    console.log(`Current block number: ${latestBlock}`);

    // Listen for ValueSet events
    this.contract.on(
      "ValueSet",
      async (
        sender,
        key,
        value,
        destinationChainId,
        nonce,
        hashedKey,
        event
      ) => {
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

          console.log(`\nNew ValueSet event detected on ${this.config.name}:`);
          console.log(`- Sender: ${sender}`);
          console.log(`- Key: ${key}`);
          console.log(`- Value: ${ethers.hexlify(value)}`);
          console.log(`- Destination Chain ID: ${destinationChainId}`);
          console.log(`- Nonce: ${nonce}`);
          console.log(`- HashedKey: ${hashedKey}`);
          console.log(`- Block Number: ${event.log.blockNumber}`);
          console.log(`- Block Hash: ${event.log.blockHash}`);
          console.log(`- Transaction Hash: ${event.log.transactionHash}`);
          console.log(`- Log Index: ${event.log.index}`);
          console.log(`- Position in Block: ${positionInBlock}`);
          if (block) {
            console.log(
              `- Block Time: ${new Date(block.timestamp * 1000).toISOString()}`
            );
          }

          try {
            await this.handleValueSetEvent({
              args: {
                sender,
                key,
                value,
                destinationChainId,
                nonce,
                hashedKey,
              },
              blockHash: event.log.blockHash,
              blockNumber: event.log.blockNumber,
              transactionHash: event.log.transactionHash,
              logIndex: event.log.index,
              positionInBlock,
            });
            this.processedEvents.add(eventId);
          } catch (error) {
            console.error(`Error handling event ${eventId}:`, error);
          }
        } catch (error) {
          console.error("Error processing event:", error);
          console.error("Event data:", {
            sender,
            key,
            value: ethers.hexlify(value),
            destinationChainId: destinationChainId.toString(),
            nonce: nonce.toString(),
            hashedKey,
            event: event.log,
          });
        }
      }
    );
  }

  async handleValueSetEvent(data) {
    const destinationChainId = data.args.destinationChainId.toString();

    // Find the destination chain config
    const destinationChain = Object.values(CHAINS).find(
      (chain) => chain.chainId.toString() === destinationChainId
    );

    if (!destinationChain) {
      console.error(
        `No configuration found for destination chain ID: ${destinationChainId}`
      );
      return;
    }

    console.log(`\nProcessing cross-chain message:`);
    console.log(`From: ${this.config.name}`);
    console.log(`To: ${destinationChain.name}`);

    // Request proof from Polymer API
    console.log(`Requesting proof from Polymer API...`);
    const proofRequest = await axios.post(
      POLYMER_API_URL,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "receipt_requestProof",
        params: [
          this.config.chainId,
          parseInt(destinationChainId),
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

    console.log(`Proof requested. Job ID: ${jobId}`);

    // we need to wait for the proof to be generated
    console.log(`Waiting for proof to be generated...`);

    // let's check the proof after 8 seconds for the first time, and then every 5 seconds
    let proofResponse;
    let attempts = 0;
    const delay = attempts === 0 ? 8000 : 5000;
    while (!proofResponse?.data || !proofResponse?.data?.result?.proof) {
      if (attempts >= 10) {
        throw new Error("Failed to get proof from Polymer API");
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

      console.log(`Proof status: ${proofResponse.data.result.status}...`);
      attempts++;
    }

    const proof = proofResponse.data.result.proof;
    console.log(`Proof received. Length: ${proof.length} bytes`);

    const proofInBytes = `0x${Buffer.from(proof, "base64").toString("hex")}`;

    // Find the destination chain contract
    const destinationProvider = new ethers.JsonRpcProvider(
      destinationChain.rpcUrl
    );
    const destinationWallet = this.wallet.connect(destinationProvider);
    const destinationContract = new ethers.Contract(
      destinationChain.contractAddress,
      CONTRACT_ABI,
      destinationWallet
    );

    // Submit the proof to the destination chain
    console.log(`Submitting proof to ${destinationChain.name}...`);

    // Estimate the tx cost
    const estimatedGas =
      await destinationContract.setValueFromSource.estimateGas(0, proofInBytes);

    console.log(`Estimated gas: ${estimatedGas.toString()}`);

    const tx = await destinationContract.setValueFromSource(0, proofInBytes, {
      gasLimit: estimatedGas, // Set an appropriate gas limit
    });

    console.log(`Transaction submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(
      `Transaction confirmed! Gas used: ${receipt.gasUsed.toString()}`
    );
  }
}

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

  console.log("Starting Cross-Chain Message Dispatcher");
  console.log("======================================");

  // Create wallet from private key
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  console.log(`Using wallet address: ${wallet.address}`);

  // Create listeners for each chain
  const listeners = [];
  for (const [chainKey, chainConfig] of Object.entries(CHAINS)) {
    const listener = new ChainListener(chainConfig, wallet);
    listeners.push(listener);
    await listener.start();
  }

  console.log("\nDispatcher is running and listening for events...");
  console.log("Press Ctrl+C to stop");
}

// Handle errors
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
