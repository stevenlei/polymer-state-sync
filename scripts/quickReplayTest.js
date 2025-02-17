/**
 * Quick Replay Protection Test for Polymer Cross-Chain State Sync
 * ===========================================================
 * 
 * This script tests the replay protection mechanism by attempting to replay
 * a previously executed cross-chain state sync transaction.
 * 
 * Usage:
 * ```bash
 * npx hardhat run scripts/quickReplayTest.js --network optimismSepolia <TX_HASH>
 * ```
 * 
 * Example:
 * ```bash
 * npx hardhat run scripts/quickReplayTest.js --network optimismSepolia 0x123...abc
 * ```
 * 
 * Expected Outcome:
 * - If replay protection works: Shows "Test Passed!" with "Proof already used" message
 * - If something's wrong: Shows unexpected error details
 * 
 * Required Environment Variables:
 * - OPTIMISM_SEPOLIA_RPC: Source chain RPC URL
 * - BASE_SEPOLIA_RPC: Destination chain RPC URL
 * - BASE_SEPOLIA_CONTRACT_ADDRESS: Destination contract address
 * - POLYMER_API_KEY: API key for Polymer proof service
 * - PRIVATE_KEY: Wallet private key for submitting transactions
 */

const axios = require('axios');
const { ethers } = require('hardhat');
require('dotenv').config();
const chalk = require("chalk");

const POLYMER_API_URL = "https://proof.testnet.polymer.zone";

async function main() {
    // Get transaction hash from args
    const txHash = process.argv[2];
    if (!txHash) {
        throw new Error("Please provide a transaction hash");
    }

    console.log(chalk.blue('\n🔄 Starting Replay Test'));
    console.log(chalk.cyan('>  Transaction Hash:'), txHash);

    // Get transaction receipt
    const provider = new ethers.JsonRpcProvider(process.env.OPTIMISM_SEPOLIA_RPC);
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
        throw new Error("Transaction not found");
    }

    // Find ValueSet event
    const valueSetEventSignature = "ValueSet(address,string,bytes,uint256,bytes32,uint256)";
    const valueSetTopic = ethers.id(valueSetEventSignature);
    const localLogIndex = receipt.logs.findIndex(
        log => log.topics[0] === valueSetTopic
    );

    if (localLogIndex === -1) {
        throw new Error("ValueSet event not found in transaction");
    }

    console.log(chalk.yellow('\n📤 Requesting Proof from Polymer...'));
    console.log(chalk.cyan('>  Block Number:'), receipt.blockNumber);
    console.log(chalk.cyan('>  Transaction Index:'), receipt.index);
    console.log(chalk.cyan('>  Log Index:'), localLogIndex);

    // Request proof
    const proofRequest = await axios.post(
        POLYMER_API_URL,
        {
            jsonrpc: "2.0",
            id: 1,
            method: "log_requestProof",
            params: [
                11155420, // Optimism Sepolia Chain ID
                receipt.blockNumber,
                receipt.index,
                localLogIndex
            ]
        },
        {
            headers: { 'Authorization': `Bearer ${process.env.POLYMER_API_KEY}` }
        }
    );

    const jobId = proofRequest.data.result;
    console.log(chalk.cyan('>  Job ID:'), jobId);

    // Poll for proof
    let proofResponse;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!proofResponse?.data?.result?.proof && attempts < maxAttempts) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 500));
        
        proofResponse = await axios.post(
            POLYMER_API_URL,
            {
                jsonrpc: "2.0",
                id: 1,
                method: "log_queryProof",
                params: [jobId]
            },
            {
                headers: { 'Authorization': `Bearer ${process.env.POLYMER_API_KEY}` }
            }
        );

        console.log(chalk.cyan(`>  Attempt ${attempts}/${maxAttempts}:`), proofResponse.data.result.status);
    }

    if (!proofResponse?.data?.result?.proof) {
        throw new Error('Failed to get proof after maximum attempts');
    }

    const proof = proofResponse.data.result.proof;
    console.log(chalk.green('\n✅ Proof Generated!'));

    // Submit to destination chain
    console.log(chalk.yellow('\n📤 Submitting to Base Sepolia...'));
    
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC));
    const destinationContract = new ethers.Contract(
        process.env.BASE_SEPOLIA_CONTRACT_ADDRESS,
        ["function setValueFromSource(bytes calldata proof) external"],
        wallet
    );

    const proofBytes = `0x${Buffer.from(proof, 'base64').toString('hex')}`;
    
    // Estimate gas
    const estimatedGas = await destinationContract.setValueFromSource.estimateGas(proofBytes);
    console.log(chalk.cyan('>  Estimated Gas:'), estimatedGas.toString());

    // Send transaction
    const tx = await destinationContract.setValueFromSource(proofBytes, {
        gasLimit: estimatedGas
    });
    console.log(chalk.cyan('>  Transaction Hash:'), tx.hash);

    // Wait for confirmation
    const destReceipt = await tx.wait();
    console.log(chalk.green('\n✅ Transaction Confirmed!'));
    console.log(chalk.cyan('>  Gas Used:'), destReceipt.gasUsed.toString());

    // Find ValueUpdated event
    const valueUpdatedEvent = destReceipt.logs.find(
        log => log.fragment?.name === "ValueUpdated"
    );

    if (valueUpdatedEvent) {
        const { hashedKey, value, version } = valueUpdatedEvent.args;
        console.log(chalk.blue('\n📝 ValueUpdated Event:'));
        console.log(chalk.cyan('>  HashedKey:'), hashedKey);
        console.log(chalk.cyan('>  Value:'), ethers.toUtf8String(value));
        console.log(chalk.cyan('>  Version:'), version.toString());
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        // Check if this is the replay protection error
        if (error.message.includes("Proof already used")) {
            console.log(chalk.green("\n✅ Test Passed!"));
            console.log(chalk.cyan(">  Replay protection is working as expected"));
            console.log(chalk.cyan(">  Error (expected):"), "Proof already used");
            process.exit(0);
        } else {
            // This is an unexpected error
            console.error(chalk.red("\n❌ Test Failed!"));
            console.error(chalk.red(">  Unexpected error:"), error.message);
            console.error(chalk.yellow(">  Note: Expected error should be 'Proof already used'"));
            process.exit(1);
        }
    });