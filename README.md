# Polymer State Sync

A cross-chain state synchronization system built on [Polymer](https://polymerlabs.org), enabling seamless state sharing across multiple EVM chains.

## Features

- Cross-chain state synchronization using Polymer Protocol's Prover
- Support for multiple EVM chains (Optimism, Base, Mode, Bob, Ink, Unichain)
- Asynchronous state propagation to all chains
- Automatic proof generation and validation with Polymer's Prover API
- Simple key-value storage interface

## Prerequisites

- Node.js (v18 or higher)
- `npm` or `yarn`
- A wallet with some testnet ETH on all supported chains:
  - Optimism Sepolia
  - Base Sepolia
  - Mode Sepolia
  - Bob Sepolia
  - Ink Sepolia
  - Unichain Sepolia
- [Polymer API Key](https://docs.polymerlabs.org/docs/build/contact) for requesting the cross-chain proof

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/stevenlei/polymer-state-sync.git
   cd polymer-state-sync
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure environment variables:

   - Copy `.env.example` to `.env`
   - Add your private key
   - Add RPC URLs for each chain
   - Add Polymer Prover addresses for each chain (already defined in `.env.example`)
   - Contract addresses will be automatically updated during deployment

## Deployment

You can deploy the contract to either a single chain or all supported chains:

### Deploy to All Chains

```bash
npm run deploy:all
```

This will:

- Deploy to all supported chains sequentially
- Update contract addresses in `.env` automatically
- Show deployment progress and results

### Deploy to Specific Chain

```bash
npm run deploy:optimism  # Deploy to Optimism Sepolia
npm run deploy:base      # Deploy to Base Sepolia
npm run deploy:mode      # Deploy to Mode Sepolia
npm run deploy:bob       # Deploy to Bob Sepolia
npm run deploy:ink       # Deploy to Ink Sepolia
npm run deploy:unichain  # Deploy to Unichain Sepolia
```

## Usage

### Run Relayer

Start the relayer to monitor and propagate state changes:

```bash
npm run relayer
```

The relayer will:

- Monitor events from all chains
- Generate proofs using Polymer Protocol
- Propagate state changes to all other chains asynchronously

### Set Value

Set a value that will be synchronized across all chains:

```bash
npm run set
```

### Get Value

Query a value from any chain:

```bash
npm run get
```

## Architecture

1. **Smart Contract (`StateSync.sol`)**

   - Stores key-value pairs
   - Emits events for state changes
   - Validates proofs with Polymer's Prover API

2. **Relayer (`relayer.js`)**

   - Starts with `npm run relayer`
   - Monitors all chains for events
   - Generates proofs for state changes
   - Propagates changes to all other chains
   - Handles async submissions

3. **Scripts**
   - `setValue.js`: Set a value on any chain (Starts with `npm run set`)
   - `getValue.js`: Query value from any chain (Starts with `npm run get`)
   - `deploy.js`: Deploy to specific chain (Starts with `npm run deploy:{chain}`)
   - `deploy-all.js`: Deploy to all chains (Starts with `npm run deploy:all`)

## Security

- Proof validation prevents unauthorized state changes
- Replay attack protection using proof hashes and nonce
- Key ownership validation for updates

## Networks

Currently supported networks (Sepolia testnet):

- Optimism
- Base
- Mode
- Bob
- Ink
- Unichain

## Disclaimer

This is a proof of concept and is not intended for production use. It may contain bugs, vulnerabilities, or other issues that make it unsuitable for use in a production environment. I am not responsible for any issues that may arise from using this project on mainnet.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
