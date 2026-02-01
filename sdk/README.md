# @inco-swap/sdk

TypeScript SDK for Inco Confidential Swap - A fully private AMM on Solana where all swap amounts are encrypted.

## Installation

```bash
cd sdk
npm install
npm run build
```

## Quick Start

```typescript
import { PrivateAmmClient, IncoEncryption, PROGRAM_IDS } from "@inco-swap/sdk";
import { PublicKey } from "@solana/web3.js";

// Initialize client
const client = new PrivateAmmClient({
  wallet: yourWalletAdapter,
  rpcEndpoint: "https://api.devnet.solana.com",
});

// Initialize encryption helper
const encryption = new IncoEncryption();

// Create a pool
const tokenAMint = new PublicKey("...");
const tokenBMint = new PublicKey("...");
await client.initializePool(tokenAMint, tokenBMint, 30); // 0.3% fee

// Add liquidity (encrypted!)
const encryptedAmountA = await encryption.encrypt(1000);
const encryptedAmountB = await encryption.encrypt(5000);
const [poolAddress] = await client.getPoolAddress(tokenAMint, tokenBMint);

await client.addLiquidity({
  pool: poolAddress,
  encryptedAmountA,
  encryptedAmountB,
});

// Execute private swap (no one can see the amount!)
const encryptedInput = await encryption.encrypt(100);
const encryptedMinOutput = await encryption.encrypt(450);

await client.swap({
  pool: poolAddress,
  encryptedAmountIn: encryptedInput,
  encryptedMinOut: encryptedMinOutput,
  direction: true, // A → B
});
```

## Deployed Programs

| Program | ID |
|---------|-----|
| inco_token | `h6T7wsEJWMxN2uEZUc4SipEd8Zmz2DWasCDopindjC5` |
| private_amm | `2UgU5dyB9Z7XEGKn3SW8CFz794ajVrSo4fuEJMQdM1t7` |

## Privacy Guarantees

| Data | On-Chain |
|------|----------|
| Pool reserves | ❌ Encrypted |
| Swap input | ❌ Encrypted |
| Swap output | ❌ Encrypted |
| LP balances | ❌ Encrypted |
| Fee rate | ✅ Visible |
| Swap direction | ✅ Visible |
