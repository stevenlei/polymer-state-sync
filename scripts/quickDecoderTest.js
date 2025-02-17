/**
 * Polymer End-to-End Test: Transaction Parameters and Proof Generation
 * ================================================================
 * 
 * This script performs a complete end-to-end test of the Polymer Protocol flow:
 * 1. Emit event from application contract on the source chain
 * 2. Capture transaction parameters
 * 3. Requests and generates proof via Polymer API
 * 4. Validates proof on destination chain
 * 
 * Networks:
 * - Source: Optimism Sepolia (Chain ID: 11155420)
 * - Destination: Base Sepolia (Chain ID: 84532)
 * 
 * Required Environment Variables:
 * - OPTIMISM_SEPOLIA_CONTRACT_ADDRESS: Source chain contract address
 * - OPTIMISM_SEPOLIA_RPC: Source chain RPC URL
 * - BASE_SEPOLIA_RPC: Destination chain RPC URL
 * - POLYMER_API_KEY: API key for Polymer proof service
 * 
 * Usage:
 * ```bash
 * npx hardhat run scripts/quickE2eTestV2.js --network optimismSepolia
 * ```
 */

// Make sure to install axios: npm install axios
const axios = require('axios');
const { ethers } = require('ethers');
require('dotenv').config();
const hre = require("hardhat");
const chalk = require("chalk");

/**
 * Summary of Steps:
 * ===============
 * 1. Contract Interaction
 *    - Connect to source chain
 *    - Sumbit transaction to emit event
 *    - Capture transaction details
 * 
 * 2. Parameter Extraction
 *    - Get block number
 *    - Get transaction index
 *    - Calculate local log index for event 
 * 
 * 3. Proof Generation
 *    - Request proof from Polymer Prove API
 *    - Poll for proof completion
 *    - Track generation time
 * 
 * 4. Proof Validation
 *    - Connect to destination chain
 *    - Validate proof using Polymer Prove
 *    - Verify event data
 */

async function getPolymerProverABI() {
    try {
        const proverAddress = process.env.POLYMER_PROVER_BASE_TESTNET_CONTRACT_ADDRESS;
        if (!proverAddress) {
            throw new Error("Polymer prover contract address not found in .env");
        }
        
        // Create Alchemy provider for Base Sepolia
        const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC);
        
        // Get contract code and ABI
        const contractCode = await provider.getCode(proverAddress);
        
        console.log('Contract code fetched:', contractCode.slice(0, 50) + '...');
        
        // Get the full contract ABI
        const contract = new ethers.Contract(
            proverAddress,
            ['function validateEvent(uint256,bytes) view returns (string,address,bytes[],bytes)'],
            provider
        );

        return contract.interface.fragments;
    } catch (error) {
        console.error('Error fetching ABI:', error);
        throw error;
    }
}

async function main() {
    console.log(chalk.blue('\n=========================================='));
    console.log(chalk.blue('🚀 Starting Polymer Prove API Test Flow'));
    console.log(chalk.blue('==========================================\n'));
    
    // Get contract configuration
    const contractAddress = process.env.OPTIMISM_SEPOLIA_CONTRACT_ADDRESS;
    if (!contractAddress) {
        throw new Error("Contract address not found in .env");
    }

    console.log(chalk.yellow('📡 Network Configuration:'));
    console.log('Source Chain:', chalk.cyan('Optimism Sepolia'), '(Chain ID: 11155420)');
    console.log('Destination Chain:', chalk.cyan('Base Sepolia'), '(Chain ID: 84532)');

    // Initialize contract
    const StateSync = await hre.ethers.getContractFactory("StateSyncV2");
    const contract = StateSync.attach(contractAddress);

    console.log(chalk.yellow('\n📝 Contract Details:'));
    console.log('Address:', chalk.cyan(contractAddress));
    
    // Prepare test data
    const key = "test-key-" + Date.now();
    const value = hre.ethers.toUtf8Bytes("Hello, Polymer!");

    console.log(chalk.yellow('\n🔄 Test Parameters:'));
    console.log('Key:', chalk.cyan(key));
    console.log('Value:', chalk.cyan(hre.ethers.toUtf8String(value)));

    // Set value in contract
    console.log(chalk.yellow('\n📤 Sending Transaction...'));
    const tx = await contract.setValue(key, value);
    console.log('Transaction Hash:', chalk.cyan(tx.hash));
    console.log('Explorer URL:', chalk.cyan(`https://sepolia-optimism.etherscan.io/tx/${tx.hash}`));

    // Wait for confirmation
    console.log(chalk.yellow("\n⏳ Waiting for Transaction Confirmation..."));
    const receipt = await tx.wait();
    console.log(chalk.green('✅ Transaction Confirmed!'));
    console.log('Block Number:', chalk.cyan(receipt.blockNumber));
    console.log('Gas Used:', chalk.cyan(receipt.gasUsed.toString()));
    
    // Get event
    const event = receipt.logs.find(
        log => log.fragment && log.fragment.name === 'ValueSet'
    );
    if (!event) {
        throw new Error("ValueSet event not found in transaction");
    }

    console.log(chalk.yellow('\n📊 Event Details from Source Contract:'));
    console.log(chalk.gray('----------------------------------------'));
    
    // Create interface for decoding
    const eventInterface = new ethers.Interface([
        "event ValueSet(address indexed sender, string key, bytes value, uint256 nonce, bytes32 indexed hashedKey, uint256 version)"
    ]);

    console.log(chalk.yellow('Event Structure:'));
    console.log(chalk.gray('ValueSet(address indexed sender, string key, bytes value, uint256 nonce, bytes32 indexed hashedKey, uint256 version)'));

    console.log(chalk.yellow('\n🔍 Topics:'));
    console.log('1. Event Signature:', chalk.cyan(event.topics[0]));
    console.log('2. Sender Address:', chalk.cyan(ethers.getAddress(ethers.dataSlice(event.topics[1], 12))));
    console.log('3. Hashed Key:', chalk.cyan(event.topics[2]));

    // Decode the complete event
    const decodedEvent = eventInterface.decodeEventLog(
        "ValueSet",
        event.data,
        event.topics
    );

    console.log(chalk.yellow('\n📦 Parameters in Unindexed Data Field:'));
    console.log('1. Sender:', chalk.cyan(decodedEvent.sender));
    console.log('2. Key:', chalk.cyan(decodedEvent.key));
    console.log('3. Value:', chalk.cyan(ethers.toUtf8String(decodedEvent.value)), 
        chalk.gray('(decoded from bytes)'));
    console.log('4. Nonce:', chalk.cyan(decodedEvent.nonce.toString()));
    console.log('5. Hashed Key:', chalk.cyan(decodedEvent.hashedKey));
    console.log('6. Version:', chalk.cyan(decodedEvent.version.toString()));

    console.log(chalk.yellow('\n📝 Summary on Source Chain:'));
    console.log(chalk.gray('----------------------------------------'));
    console.log(`Address ${chalk.cyan(decodedEvent.sender)} emitted a ValueSet event`);
    console.log(`Set key "${chalk.cyan(decodedEvent.key)}" to value "${chalk.cyan(ethers.toUtf8String(decodedEvent.value))}"`);
    console.log(`Update #${chalk.cyan(decodedEvent.nonce.toString())} for version ${chalk.cyan(decodedEvent.version.toString())}`);

    // Prepare Polymer parameters
    const sourceChainId = 11155420;
    const destChainId = 84532;
    const blockNumber = receipt.blockNumber;
    const transactionIndex = receipt.index;

    // Calculate event position
    const valueSetEventSignature = "ValueSet(address,string,bytes,uint256,bytes32,uint256)";
    const valueSetTopic = ethers.id(valueSetEventSignature);
    const localLogIndex = receipt.logs.findIndex(
        log => log.topics[0] === valueSetTopic
    );

    console.log(chalk.yellow('\n🔄 Polymer Prove API Parameters (transaction identifiers):'));
    console.log('Source Chain ID:', chalk.cyan(sourceChainId), '(Optimism Sepolia)');
    console.log('Destination Chain ID:', chalk.cyan(destChainId), '(Base Sepolia)');
    console.log('Block Number:', chalk.cyan(blockNumber));
    console.log('Transaction Index:', chalk.cyan(transactionIndex));
    console.log('Local Log Index:', chalk.cyan(localLogIndex));

    // Request proof
    console.log(chalk.yellow('\n📤 Requesting Proof from Polymer API...'));
    const startTime = Date.now();
    let proofStartTime = startTime;
    let proofEndTime = null;

    const proofRequest = await axios.post(
        'https://proof.testnet.polymer.zone',
        {
            jsonrpc: "2.0",
            id: 1,
            method: "log_requestProof",
            params: [
                sourceChainId,
                blockNumber,
                transactionIndex,
                localLogIndex
            ]
        },
        {
            headers: { 'Authorization': `Bearer ${process.env.POLYMER_API_KEY}` }
        }
    );

    const jobId = proofRequest.data.result;
    const requestTime = (Date.now() - startTime) / 1000;
    console.log(chalk.green('\n✅ Proof Request Submitted:'));
    console.log('Job ID:', chalk.cyan(jobId));
    console.log('Request Time:', chalk.cyan(`${requestTime.toFixed(2)}s`));

    // Poll for proof completion
    console.log(chalk.yellow('\n⏳ Waiting for Proof Generation...'));
    let proofResponse;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!proofResponse?.data?.result?.proof && attempts < maxAttempts) {
        attempts++;
        const currentTime = Date.now();
        const elapsedTime = (currentTime - startTime) / 1000;
        
        console.log(chalk.yellow(`\nAttempt ${attempts}/${maxAttempts}`));
        console.log('Time Elapsed:', chalk.cyan(`${elapsedTime.toFixed(2)}s`));
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        proofResponse = await axios.post(
            'https://proof.testnet.polymer.zone',
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

        // Track when proof generation actually starts
        if (proofResponse.data.result.status === 'generating' && proofStartTime === startTime) {
            proofStartTime = currentTime;
            console.log(chalk.cyan('\n🔄 Proof generation started...'));
        }
        
        if (proofResponse.data.result.proof) {
            proofEndTime = Date.now();
            const totalTime = (proofEndTime - startTime) / 1000;
            const queueTime = (proofStartTime - startTime) / 1000;
            const generationTime = (proofEndTime - proofStartTime) / 1000;
            
            const proof = proofResponse.data.result.proof;
            const proofBytes = Buffer.from(proof, 'base64');
            const proofHex = `0x${proofBytes.toString('hex')}`;
            
            console.log(chalk.green(`\n✅ Proof Generation Complete!`));
            console.log('Request Time:', chalk.cyan(`${requestTime.toFixed(2)}s`));
            if (queueTime > 0 && proofStartTime !== startTime) {
                console.log('Queue Time:', chalk.cyan(`${queueTime.toFixed(2)}s`));
            }
            console.log('Generation Time:', chalk.cyan(`${generationTime.toFixed(2)}s`));
            // console.log('Total Time:', chalk.cyan(`${totalTime.toFixed(2)}s`));
            console.log('Proof Size:', chalk.cyan(`${proofBytes.length.toLocaleString()} bytes`));
            
            console.log(chalk.yellow('\n🔍 Validating Proof on Base Sepolia...'));
            const validationStartTime = Date.now();
            
            const baseProvider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC);
            const proverAddress = process.env.POLYMER_PROVER_BASE_TESTNET_CONTRACT_ADDRESS;
            if (!proverAddress) {
                throw new Error("Polymer prover contract address not found in .env");
            }
            
            const polymerProver = new ethers.Contract(
                proverAddress,
                ['function validateEvent(bytes) view returns (uint32,address,bytes,bytes)'],
                baseProvider
            );

            try {
                // Start timing the validation
                const validationStartTime = Date.now();
                
                // Validate the proof
                const validationResult = await polymerProver.validateEvent(proofHex);
                
                // Calculate validation time
                const validationTime = (Date.now() - validationStartTime) / 1000;
                
                console.log(chalk.green('\n✅ Proof Validation Successful!'));
                console.log('Validation Time:', chalk.cyan(`${validationTime.toFixed(2)}s`));
                
                // Start timing the decoding process
                const decodingStartTime = Date.now();
                
                // Define the event interface for decoding
                const eventInterface = new ethers.Interface([
                    "event ValueSet(address indexed sender, string key, bytes value, uint256 nonce, bytes32 indexed hashedKey, uint256 version)"
                ]);

                // Decode the event data
                console.log(chalk.yellow('\n📋 Decoded Params returned by the Prover Contract:'));
                console.log(chalk.gray('----------------------------------------'));
                
                const [chainId, emittingContract, topics, unindexedData] = validationResult;
                
                console.log('Chain ID:', chalk.cyan(chainId.toString()), chalk.gray('(Optimism Sepolia)'));
                console.log('Emitting Contract:', chalk.cyan(emittingContract), chalk.gray('(Original source contract)'));
                console.log('\nRaw Topics Hex:', chalk.gray('(Concatenated event topics)'));
                console.log(chalk.cyan(topics));
                console.log('\nRaw Unindexed Data:', chalk.gray('(ABI-encoded non-indexed parameters)'));
                console.log(chalk.cyan(unindexedData));

                try {
                    // Split the topics string into individual topics (each 32 bytes/64 chars + '0x')
                    console.log(chalk.yellow('\n🔍 Split Topics Analysis:'));
                    console.log(chalk.gray('Each topic is 32 bytes (64 characters) long\n'));
                    
                    const topicsArray = [];
                    const rawTopics = topics.slice(2);
                    for(let i = 0; i < rawTopics.length; i += 64) {
                        topicsArray.push('0x' + rawTopics.slice(i, i + 64));
                    }
                    
                    console.log('Topic[0]:', chalk.cyan(topicsArray[0]));
                    console.log(chalk.gray('↳ Event signature: keccak256("ValueSet(address,string,bytes,uint256,bytes32,uint256)")'));
                    
                    console.log('\nTopic[1]:', chalk.cyan(topicsArray[1]));
                    console.log(chalk.gray('↳ Indexed sender address (padded to 32 bytes)'));
                    
                    console.log('\nTopic[2]:', chalk.cyan(topicsArray[2]));
                    console.log(chalk.gray('↳ Indexed hashedKey (bytes32 hash of the key parameter)'));

                    // Decoding event data
                    console.log(chalk.yellow('\n📦 Decoded Event Data:'));
                    console.log(chalk.gray('----------------------------------------'));
                    const decodedData = eventInterface.decodeEventLog(
                        "ValueSet",
                        unindexedData,
                        topicsArray
                    );
                    
                    console.log('1. Sender:', chalk.cyan(decodedData[0]));
                    console.log(chalk.gray('   ↳ Address that initiated the state update'));
                    
                    console.log('\n2. Key:', chalk.cyan(decodedData[1]));
                    console.log(chalk.gray('   ↳ String identifier for the stored value'));
                    
                    console.log('\n3. Value:', chalk.cyan(ethers.toUtf8String(decodedData[2])));
                    console.log(chalk.gray('   ↳ UTF8 decoded content of the stored bytes'));
                    
                    console.log('\n4. Nonce:', chalk.cyan(decodedData[3].toString()), chalk.gray('(7n means BigNumber 7)'));
                    console.log(chalk.gray('   ↳ Sequential counter for this key'));
                    
                    console.log('\n5. HashedKey:', chalk.cyan(decodedData[4]));
                    console.log(chalk.gray('   ↳ Keccak256 hash of the key for indexed searching'));
                    
                    console.log('\n6. Version:', chalk.cyan(decodedData[5].toString()), chalk.gray('(1n means BigNumber 1)'));
                    console.log(chalk.gray('   ↳ Protocol version number'));

                    // Extract values for summary
                    const decodedValue = ethers.toUtf8String(decodedData.value);

                    console.log(chalk.yellow('\n📊 Event Summary Proven on Destination Chain'));
                    console.log(chalk.gray('----------------------------------------'));
                    console.log(`A state update was made by ${chalk.cyan(decodedData.sender)}`);
                    console.log(`Key "${chalk.cyan(decodedData.key)}" was set to "${chalk.cyan(decodedValue)}"`);
                    console.log(`This was update number ${chalk.cyan(decodedData.nonce.toString())} for version ${chalk.cyan(decodedData.version.toString())}`);
                    console.log(`Emitted on chain ${chalk.cyan(chainId)} from contract ${chalk.cyan(emittingContract)}`);

                } catch (decodeError) {
                    console.error('Error decoding event data:', decodeError);
                    console.log('Raw unindexedData:', unindexedData);
                }

            } catch (validationError) {
                console.log(chalk.red('\n❌ Proof Validation Failed:'));
                console.error('Error:', validationError.message);
                throw validationError;
            }
        } else {
            console.log('Status:', chalk.cyan(proofResponse.data.result.status));
        }
    }

    if (!proofResponse?.data?.result?.proof) {
        throw new Error('Failed to get proof after maximum attempts');
    }
}

// Execute with error handling
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(chalk.red("\n❌ Error:"), error);
        process.exit(1);
    });