const { ethers } = require("hardhat");
const axios = require("axios");
const chalk = require("chalk");

const POLYMER_API_URL = "https://proof.testnet.polymer.zone/";

async function retryWithDelay(fn, retries = 3, delay = 5000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(chalk.yellow(`\nAPI returned ${error.response?.status}. Retrying in ${delay/1000} seconds... (Attempt ${i + 2}/${retries})`));
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function main() {
    console.log(chalk.blue('\n🔍 Testing Polymer API with Latest Optimism Block'));
    
    // Setup provider
    const provider = new ethers.JsonRpcProvider(process.env.OPTIMISM_SEPOLIA_RPC);
    
    // Get latest block
    const latestBlock = await provider.getBlock('latest');
    console.log('\nLatest Block:', chalk.cyan(latestBlock.number));
    
    // Get a transaction from this block
    let block = await provider.getBlock(latestBlock.number, true);
    if (!block.transactions.length || block.transactions.length < 2) {
        console.log(chalk.red('Not enough transactions in latest block. Trying previous block...'));
        block = await provider.getBlock(latestBlock.number - 1, true);
    }

    if (!block.transactions.length || block.transactions.length < 2) {
        console.error(chalk.red('\n❌ No second transaction found in current or previous block'));
        console.log(chalk.yellow('Try running the script again in a few seconds...'));
        process.exit(1);
    }

    // Get transaction receipt to get the index
    const txHash = typeof block.transactions[1] === 'string' 
        ? block.transactions[1] 
        : block.transactions[1].hash;

    console.log('\nFetching receipt for transaction:', chalk.cyan(txHash));
    const receipt = await provider.getTransactionReceipt(txHash);
    
    console.log('\nTest Transaction:');
    console.log('Hash:', chalk.cyan(txHash));
    console.log('Block:', chalk.cyan(block.number));
    console.log('Transaction Index:', chalk.cyan(receipt.index));

    // Test Polymer API
    console.log(chalk.yellow('\n📤 Testing Polymer API...'));
    try {
        const startTime = Date.now();
        const proofRequest = await retryWithDelay(async () => {
            return axios.post(
                POLYMER_API_URL,
                {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "receipt_requestProof",
                    params: [
                        11155420,  // Optimism Sepolia Chain ID
                        84532,     // Base Sepolia Chain ID
                        block.number,
                        receipt.index
                    ],
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.POLYMER_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                }
            );
        }, 3, 5000);  // 3 retries, 5 second delay

        const jobId = proofRequest.data.result;
        const requestTime = (Date.now() - startTime) / 1000;
        console.log(chalk.green('\n✅ Proof Request Submitted:'));
        console.log('Job ID:', chalk.cyan(jobId));
        console.log('Request Time:', chalk.cyan(`${requestTime.toFixed(2)}s`));

        // Poll for proof completion
        console.log(chalk.yellow('\n⏳ Waiting for Proof Generation...'));
        let proofResponse;
        let attempts = 0;
        const maxAttempts = 12;  // Fewer attempts but longer intervals
        
        while (attempts < maxAttempts) {
            attempts++;
            console.log(chalk.yellow(`\nPolling Attempt ${attempts}/${maxAttempts}`));
            
            try {
                proofResponse = await axios.post(
                    POLYMER_API_URL,
                    {
                        jsonrpc: "2.0",
                        id: 1,
                        method: "receipt_queryProof",
                        params: [jobId]
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.POLYMER_API_KEY}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    }
                );

                const result = proofResponse.data.result;
                const currentTime = (Date.now() - startTime) / 1000;
                console.log('Status:', chalk.cyan(result.status));
                console.log('Time Elapsed:', chalk.cyan(`${currentTime.toFixed(2)}s`));

                if (result.status === 'complete' && result.proof) {
                    const totalTime = (Date.now() - startTime) / 1000;
                    const proofHex = '0x' + Buffer.from(result.proof, 'base64').toString('hex');
                    const decodedLength = Buffer.from(result.proof, 'base64').length;
                    
                    console.log(chalk.green('\n✅ Proof Generation Complete!'));
                    console.log('Total Time:', chalk.cyan(`${totalTime.toFixed(2)}s`));
                    console.log('Proof Size:', chalk.cyan(`${decodedLength} bytes`));
                    
                    console.log('\nProof (base64):');
                    console.log(chalk.gray(result.proof.slice(0, 100) + '...')); // Show first 100 chars

                    console.log('\nProof (hex):');
                    console.log(chalk.gray('Note: Convert base64 to hex format when passing proof to on-chain functions'));
                    console.log(chalk.gray(proofHex.slice(0, 100) + '...')); // Show first 100 chars
                    break;
                } else if (result.status === 'error') {
                    console.error(chalk.red('\n❌ Proof Generation Failed:'));
                    console.error(result.error || 'Unknown error');
                    process.exit(1);
                }

                // Longer wait time between polls for V1 API
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
            } catch (error) {
                console.error(chalk.red('\n❌ Polling Error:'));
                console.error('Status:', error.response?.status);
                console.error('Data:', error.response?.data);
                throw error;
            }
        }

        if (attempts >= maxAttempts) {
            const timeoutTime = (Date.now() - startTime) / 1000;
            console.error(chalk.red('\n❌ Timeout waiting for proof generation'));
            console.error('Time Elapsed:', chalk.cyan(`${timeoutTime.toFixed(2)}s`));
            process.exit(1);
        }

    } catch (error) {
        console.error(chalk.red('\n❌ API Error:'));
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(chalk.red("Error:"), error);
        process.exit(1);
    });