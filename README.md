# Cross-Chain Key-Value Store with Polymer

A decentralized key-value store that allows users to store and retrieve key-value pairs **across multiple chains**, using [Polymer](https://www.polymerlabs.org) to enable secure cross-chain communication. This project demonstrates how to build a cross-chain application that allows users to access their data from any chain that is supported.

## Features

- ✨ Store and retrieve key-value pairs across different chains
- 🔄 Cross-chain synchronization using Polymer's Prover API
- 🎯 Support for Optimism Sepolia and Base Sepolia testnets (more to come in the future)
- 🖥️ Interactive CLI interface for easy interaction

## Prerequisites

- Node.js (v18 or higher)
- `npm` or `yarn`
- A wallet with some testnet ETH on **Optimism Sepolia** and **Base Sepolia**
- [Polymer API Key](https://docs.polymerlabs.org/docs/build/contact) for requesting the cross-chain proof

## Installation

1. Clone the repository:

```bash
git clone git@github.com:stevenlei/polymer-prover-crosschain-hashmap.git
cd polymer-prover-crosschain-hashmap
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

```env
# Wallet private key for the relayer, and interacting with the contracts
PRIVATE_KEY=

# Polymer Prover Contracts (https://docs.polymerlabs.org/docs/build/start)
POLYMER_PROVER_OPTIMISM_TESTNET_CONTRACT_ADDRESS=0x1CCb363c18484A568DCB0Ec37fE5ad716C1D6e77
POLYMER_PROVER_BASE_TESTNET_CONTRACT_ADDRESS=0xc774Ff2aC1f873971e7E60A9b41cF46042989380

# Contract addresses after deployment
OPTIMISM_CONTRACT_ADDRESS=
BASE_CONTRACT_ADDRESS=

# RPCs
OPTIMISM_SEPOLIA_RPC=
BASE_SEPOLIA_RPC=

# Polymer API Key (Request from https://docs.polymerlabs.org/docs/build/contact)
POLYMER_API_KEY=
```

## Contract Architecture

The `CrossChainStore` contract provides:

- `setValue(string key, bytes value, uint256 destinationChainId)`: Store a value and emit an event for cross-chain syncing
- `getValue(address originalSender, string key)`: Retrieve a value using the original sender and key
- `setValueFromSource(uint256 logIndex, bytes proof)`: Process cross-chain value updates with Polymer proofs

Key features:

- Secure ownership tracking using `keyOwners` mapping
- Nonce management to prevent replay attacks and to ensure proofs can only be used once
- Proof validation using Polymer's prover contract
- Event emission for cross-chain synchronization (with the support of the relayer)

## Usage

Here's the flow to deploy and use this application:

1. **Deploy Contracts**: Deploy the `CrossChainStore` contract to both chains.
2. **Run Cross-Chain Relayer**: Enable cross-chain communication by running the relayer.
3. **Store Values**: Use the `setValue` command to store a value and sync it across chains.
4. **Retrieve Values**: Use the `getValue` command to retrieve a value from any chain.

### Deploy Contracts

The `CrossChainStore` contract is a demo contract used to store key-value pairs on blockchains, we need to deploy it to both chains.

### Contract Deployment Script

Deploy the contract to Optimism Sepolia:

```bash
npm run deploy:optimism
```

Deploy the contract to Base Sepolia:

```bash
npm run deploy:base
```

Update your `.env` file with the deployed contract addresses, to `OPTIMISM_CONTRACT_ADDRESS` and `BASE_CONTRACT_ADDRESS`.

### Run Cross-Chain Relayer

To enable cross-chain communication, we need to run the relayer script, which will listen to events on both chains, and once an event is detected, it will request a proof from Polymer and submit it to the destination chain.

```bash
npm run relayer
```

The relayer:

1. Monitors both chains for `ValueSet` events
2. Requests proofs from Polymer when events are detected
3. Submits proofs to destination chains to sync values
4. Provides detailed logs of the cross-chain process

### Store Values

To store a value, new or updated, on any chain:

```bash
npm run setValue
```

This interactive command will:

1. Ask you to select the source chain
2. Ask you to select the destination chain
3. Prompt for a key and value
4. Submit the transaction to store the value
5. Display transaction details and confirmation

### Retrieve Values

To retrieve a value from any chain:

```bash
npm run getValue
```

This interactive command will:

1. Ask you to select the chain to query from
2. Ask for the original sender's address (optional): This is like a namespace, so that keys will not be overwritten by other senders. If you are setting a value with `npm run setValue`, you may just leave this blank
3. Ask for the key to query
4. Display the value in both bytes and UTF-8 format

## Development

### Project Structure

```
├── contracts/
│   └── CrossChainStore.sol    # Main contract
├── scripts/
│   ├── deploy.js             # Contract deployment
│   ├── getValue.js           # Value retrieval
│   ├── relayer.js           # Cross-chain relayer
│   └── setValue.js          # Value storage
└── hardhat.config.js        # Network configuration
```

## Security Considerations

- Always handle private keys securely and never commit them to version control. Use a separate development wallet.
- The relayer requires a funded wallet to cover gas fees for cross-chain transactions. Make sure to keep it topped up.
- Polymer proofs ensure secure cross-chain communication, we are setting the keys on the destination chain solely with the provided proof, extracting the data from the event.
- Each key-value pair is tied to its original sender's address, like a concept of a namespace, so that keys will not be overwritten by other senders.
- Nonces are used to prevent replay attacks, so that proofs can only be used once.

## Disclaimer

This project is for educational and demonstration purposes only. It may contain bugs, vulnerabilities, or other issues that make it unsuitable for use in a production environment. I am not responsible for any issues that may arise from using this project on mainnet. **DO NOT USE IT ON MAINNET**.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License
