# Raydium Token Launcher

![Raydium Token Launcher Banner](https://via.placeholder.com/1200x300/9945FF/FFFFFF?text=Raydium+Token+Launcher)

A comprehensive application for creating and managing SPL tokens on Solana with Raydium AMM integration. This tool allows you to mint tokens, create markets, establish liquidity pools, and perform swaps - all from a convenient user interface.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [API Reference](#api-reference)
- [Common Issues & Solutions](#common-issues--solutions)
- [Development Notes](#development-notes)
- [Contributing](#contributing)
- [License](#license)

## 🌟 Overview

Raydium Token Launcher is a full-stack web application that streamlines the process of launching tokens on the Solana blockchain. It leverages the Raydium SDK to create tokens, markets, and liquidity pools, enabling users to quickly establish and manage tokens for trading.

The application consists of:
- A React-based frontend for an intuitive user experience
- An Express.js backend that interacts with the Solana blockchain
- Integration with Raydium DEX for AMM functionality

## ✨ Features

- **Token Creation**: Mint SPL tokens with custom properties (name, symbol, decimals, supply)
- **Market Creation**: Establish trading markets for tokens with automated lot size optimization
- **Liquidity Pool Management**: Create pools, add/remove liquidity, and view pool statistics
- **Swapping**: Exchange tokens using the Raydium AMM
- **Wallet Integration**: View token balances and transaction history
- **Error Resilience**: Graceful handling of blockchain transaction failures with fallback mechanisms
- **Placeholder Pools**: Support for tokens without real pools for better user experience

## 🏗️ Architecture

### Backend Components

1. **Express Server** (`server.ts`)
   - Handles HTTP requests
   - Provides REST API endpoints
   - Serves static frontend files
   - Implements error handling and validation

2. **Raydium Integration** (`raydium.ts`)
   - Interfaces with Raydium SDK
   - Manages token, market, and pool operations
   - Implements retry logic and error handling for blockchain operations
   - Maintains local database of pools and tokens

3. **Token Management** (`token.ts`)
   - Creates and queries SPL tokens
   - Handles token metadata and balances

4. **Configuration** (`config.ts`)
   - Manages environment variables
   - Sets up connection to Solana cluster
   - Handles wallet keypair loading

### Frontend Components

1. **Home Component** (`Home.jsx`)
   - Main user interface
   - Manages token and pool selection
   - Coordinates form submissions
   - Displays transaction results

2. **Token Creation Form** (`TokenCreationForm.jsx`)
   - Dedicated interface for token creation
   - Provides real-time price estimation
   - Handles token percentage allocation to pools

3. **Pending Pool Management** (`PendingPoolManagement.jsx`)
   - UI for tokens without actual pools
   - Allows manual market and pool creation
   - Shows placeholder pool information

### Data Flow

1. User interacts with the frontend forms
2. React components call backend API endpoints
3. Backend validates requests and calls Raydium/Solana methods
4. Blockchain operations are executed with retry mechanisms
5. Results are stored in local database when appropriate
6. Response is sent back to frontend
7. UI updates to reflect changes

## 🚀 Installation

### Prerequisites

- Node.js (v14+)
- npm or yarn
- Solana CLI tools
- A Solana wallet with SOL (devnet or mainnet)

### Setup Steps

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/raydium-token-launcher.git
cd raydium-token-launcher
```

2. **Install dependencies**

```bash
npm install
```

3. **Create wallet configuration**

Either place an existing wallet JSON file at `./wallet.json` or let the application generate one on first run.

4. **Configure environment**

Create a `.env` file in the root directory:

```
SOLANA_CLUSTER=devnet
RPC_ENDPOINT=https://api.devnet.solana.com
WALLET_PATH=./wallet.json
```

5. **Build the application**

```bash
npm run build
```

6. **Start the application**

```bash
npm run start
```

For development mode with hot reloading:

```bash
npm run dev
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLANA_CLUSTER` | Solana cluster to connect to | `devnet` |
| `RPC_ENDPOINT` | RPC endpoint URL | `https://api.devnet.solana.com` |
| `WALLET_PATH` | Path to wallet keypair JSON | `./wallet.json` |
| `PORT` | Port for the Express server | `3001` |

### Wallet Setup

The application requires a Solana wallet keypair for creating tokens and interacting with the blockchain. You can:

1. **Use an existing wallet**: Place your keypair JSON at the path specified in `WALLET_PATH`
2. **Generate a new wallet**: If no wallet file is found, the application automatically generates one

> ⚠️ **Important**: Make sure to fund your wallet with SOL before creating tokens or pools. For devnet, use a faucet like `https://solfaucet.com`.

## 📝 Usage Guide

### Creating a Token

1. Navigate to the "Create Token & Pool" tab
2. Fill in token details:
   - **Name**: Your token's full name (e.g., "Bitcoin")
   - **Symbol**: Short identifier (e.g., "BTC")
   - **Description** (optional): Information about your token
   - **Decimals**: Precision (usually 9 for SPL tokens)
   - **Initial Supply**: Total number of tokens to mint
3. Configure liquidity settings:
   - **Initial SOL Liquidity**: Amount of SOL to add to the pool
   - **Percentage of Token Supply**: Percentage of tokens allocated to the initial pool
4. Review the initial price preview
5. Click "Create Token & Pool"
6. Wait for the transaction to complete

The token creation process involves:
1. Minting a new SPL token
2. Creating a market for the token paired with SOL
3. Establishing a liquidity pool with the specified amounts

If market or pool creation fails, the token will still be created and appear in your list, allowing you to create these manually later.

### Managing Existing Tokens

1. Select a token from the sidebar
2. Navigate to the "Manage Pool" tab
3. Choose from available operations:

#### Adding Liquidity
- Enter the amount to add
- Select which side to hold fixed (SOL or token)
- Set your slippage tolerance
- Click "Add Liquidity"

#### Removing Liquidity
- Enter the LP token amount to withdraw
- Set your slippage tolerance
- Click "Remove Liquidity"

#### Swapping
- Select the token direction (SOL to token or token to SOL)
- Enter the amount to swap
- Set your slippage tolerance
- Click "Swap"

### Creating Markets and Pools Manually

If automatic creation failed:

1. Select the token from the sidebar
2. You'll see the "Create Pool" interface for tokens without pools
3. Enter the desired token amount and SOL amount
4. Click "Create Market & Pool"

The interface will attempt different lot and tick size combinations to maximize the chance of success.

## 🔌 API Reference

### Token Endpoints

#### `POST /api/token/create`
Creates a new SPL token.

**Request Body:**
- `name` (string, required): Token name
- `symbol` (string, required): Token symbol
- `description` (string): Description
- `decimals` (number): Decimal places (default: 9)
- `initialSupply` (number): Total supply (default: 1,000,000,000)
- `image` (file): Token image (optional)

#### `POST /api/token/create-with-pool`
Creates a token, market, and pool in one operation.

**Request Body:**
- All fields from `/api/token/create`
- `initialLiquidity` (number): SOL amount for pool
- `percentage` (number): Percentage of token supply for pool

#### `GET /api/token/list`
Returns all tokens owned by the wallet.

#### `GET /api/token/balance/:mintAddress`
Returns the balance of a specific token.

#### `GET /api/token/metadata/:mintAddress`
Returns metadata for a token.

### Market Endpoints

#### `POST /api/market/create`
Creates a market for a token paired with SOL.

**Request Body:**
- `baseMint` (string, required): Token mint address
- `quoteMint` (string, required): Quote token mint (usually SOL)
- `lotSize` (number): Lot size (default: 1)
- `tickSize` (number): Tick size (default: 0.01)

### Pool Endpoints

#### `POST /api/pool/create`
Creates a liquidity pool for a market.

**Request Body:**
- `marketId` (string, required): Market ID
- `baseAmount` (number, required): Amount of base token
- `quoteAmount` (number, required): Amount of quote token

#### `GET /api/pool/:poolId`
Returns information about a specific pool.

#### `GET /api/pool/token/:mintAddress`
Returns all pools for a specific token.

#### `GET /api/pool/list`
Returns all pools created by the wallet owner.

#### `POST /api/pool/placeholder`
Creates a placeholder pool for a token.

**Request Body:**
- `mint` (string, required): Token mint address
- `name` (string): Token name
- `symbol` (string): Token symbol
- `decimals` (number): Token decimals

### Liquidity Endpoints

#### `POST /api/liquidity/add`
Adds liquidity to a pool.

**Request Body:**
- `poolId` (string, required): Pool ID
- `amount` (number, required): Amount to add
- `fixedSide` (string): Side to hold fixed ('a' or 'b')
- `slippage` (number): Slippage tolerance in percent

#### `POST /api/liquidity/remove`
Removes liquidity from a pool.

**Request Body:**
- `poolId` (string, required): Pool ID
- `lpAmount` (number, required): LP token amount to remove
- `slippage` (number): Slippage tolerance in percent

### Swap Endpoints

#### `POST /api/swap`
Executes a swap on a pool.

**Request Body:**
- `poolId` (string, required): Pool ID
- `inputMint` (string, required): Input token mint address
- `amount` (number, required): Amount to swap
- `fixedSide` (string): Side to hold fixed ('in' or 'out')
- `slippage` (number): Slippage tolerance in percent

## 🛠️ Common Issues & Solutions

### Insufficient SOL Balance

**Issue**: Token or market creation fails with a balance error.
**Solution**: Fund your wallet with more SOL. For devnet, use a faucet like `https://solfaucet.com`.

### Market Creation Errors

**Issue**: Market creation fails with "Custom program error: 0x1".
**Solution**: 
- Ensure your wallet has at least 1-2 SOL
- Try different lot size and tick size combinations
- The application will automatically try several combinations

### Non-base58 Character Errors

**Issue**: Pool operations fail with "Non-base58 character" errors.
**Solution**: This usually happens with invalid pool IDs. The application now validates pool IDs and handles these errors gracefully.

### Transaction Too Large

**Issue**: Market or pool creation fails with "Transaction too large".
**Solution**: Try with smaller lot size and tick size values. The updated application tries multiple combinations automatically.

### BN.js Assertion Errors

**Issue**: Pool creation fails with "Assertion failed" from BN.js.
**Solution**: This is fixed in the updated code by properly converting floating-point numbers to BN objects.

## 📔 Development Notes

### Raydium SDK Limitations

The Raydium SDK is primarily designed for mainnet and may have some limitations on devnet:

1. Market creation can be sensitive to lot size and tick size parameters
2. Transaction fees may be higher than expected for complex operations
3. Some pool operations might not work the same way as on mainnet

### Error Handling Strategy

The application implements a robust error handling approach:

1. **Graceful degradation**: If part of an operation fails (e.g., market creation), the application continues with what succeeded (e.g., token creation)
2. **Retry mechanisms**: For market creation, multiple parameter combinations are tried
3. **Placeholder objects**: Tokens without real pools get placeholder entries for UI navigation
4. **Detailed error information**: Errors include specific details to help users resolve issues

### Local Database

The application maintains a local database of pools in the `data` directory. This allows:

1. Tracking pools created by the user
2. Fallback when RPC queries fail
3. Support for placeholder pools

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 📊 Technical Details

### Dependency Graph

```
raydium-token-launcher
├── backend
│   ├── config.ts          # Configuration and connection setup
│   ├── raydium.ts         # Raydium SDK integration
│   ├── server.ts          # Express API server
│   └── token.ts           # SPL token operations
├── data                   # Local database files
├── frontend
│   ├── public             # Static assets
│   └── src
│       ├── App.jsx        # Main React application
│       └── components
│           ├── Home.jsx                  # Main UI component
│           ├── TokenCreationForm.jsx     # Token creation interface
│           ├── PendingPoolManagement.jsx # Interface for tokens without pools
│           └── styles                    # CSS files
└── wallet.json            # Wallet keypair (created on first run)
```

### Technology Stack

- **Backend**:
  - Node.js + TypeScript
  - Express.js for API
  - @solana/web3.js for blockchain interaction
  - @raydium-io/raydium-sdk-v2 for AMM functionality
  - BN.js for big number handling

- **Frontend**:
  - React for UI components
  - Axios for API requests
  - CSS for styling

### Database Schema

Pools are stored in `data/pools.json` with the following structure:

```json
[
  {
    "poolId": "string",
    "txId": "string",
    "marketId": "string",
    "baseMint": "string",
    "baseName": "string",
    "baseSymbol": "string",
    "baseDecimals": 9,
    "baseAmount": 1000000,
    "quoteMint": "string",
    "quoteName": "string",
    "quoteSymbol": "string",
    "quoteDecimals": 9,
    "quoteAmount": 1,
    "lpMint": "string",
    "createdAt": "ISO date string",
    "owner": "string",
    "initialPrice": 0.000001,
    "isPlaceholder": false
  }
]
```

### Performance Considerations

- **Transaction Batching**: Market creation operations are executed sequentially
- **Retry Logic**: Failed operations are retried with different parameters
- **Local Caching**: Pool information is cached locally to reduce RPC calls
- **Input Validation**: All user inputs are validated before blockchain operations

---

## 🔗 Additional Resources

- [Solana Documentation](https://docs.solana.com/)
- [Raydium SDK Documentation](https://docs.raydium.io/developers/raydium-sdk)
- [SPL Token Program](https://spl.solana.com/token)

---

Created with ❤️ by THMIST