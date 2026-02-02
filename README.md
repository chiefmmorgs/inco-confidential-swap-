# Inco Confidential Swap

> **Privacy-first DEX on Base Sepolia and solana devnet powered by Inco Network's FHE technology.**

https://inco-confidential-swap.vercel.app/

https://www.loom.com/share/7a94128152824d2eb58e262141e3a50e [video] 

A decentralized exchange and private transfer application. This project demonstrates how to build confidentiality-enabled interaction on EVM chains and solana using Inco's Fully Homomorphic Encryption (FHE).

## Features

###  Confidential Swaps
- Swap **cUSDC** and **cETH** or **cUSDC** and **cSOL**  with completely encrypted amounts.
- Input values are encrypted client-side using the Inco SDK.
- On-chain balances remain hidden from the public eye.

###  Shadow Transfer
- Send encrypted tokens to any address securely.
- Uses `transfer(address, bytes)` overloaded function to handle encrypted inputs.
- Only the sender and receiver can view the transferred value.



## Getting Started

### Prerequisites
- Node.js 18+
- MetaMask Wallet (connected to Base Sepolia)
- phantom wallet (CONNECT TO SOLANA DEVNET)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/chiefmmorgs/inco-confidential-swap-.git
   cd inco-confidential-swap-
   ```

2. Install dependencies:
   ```bash
   cd frontend
   npm install
   # or
   pnpm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Smart Contracts (Base Sepolia)

| Contract | Address |
|----------|---------|
| **Confidential ETH** | `0x525c34cb249826f74352D086d494957920B2F2E4` |
| **Confidential USDC** | `0x789d6e7f86641829636605d8f64483d735165d70` |
| **Confidential Swap** | `0xfDE351E7d8B90731F2A70cf076A10f7605D4122d` |

##  Cross-Chain Bridge (Base ↔ Solana)

Private cross-chain swaps between **Base Sepolia** and **Solana Devnet** using Inco Lightning encryption.

### How It Works
1. **Encrypt**: Amount is encrypted using Inco FHE (Base) or Inco Lightning (Solana)
2. **Bridge**: Relay Protocol transfers assets cross-chain
3. **Unwrap**: Recipient can decrypt and access tokens on destination chain

### Solana Devnet Setup
- Install **Phantom** or **Solflare** wallet
- Switch to **Devnet** network
- Get test SOL from [Solana Faucet](https://faucet.solana.com/)

| Component | Address/ID |
|-----------|------------|
| **Inco Lightning Program** | `h6T7wsEJWMxN2uEZUc4SipEd8Zmz2DWasCDopindjC5` |
| **Confidential USDC (Solana)** | `G7EzuDs86oQX7ckv5AheQTBgas4UYFqD1Zorx3V3FhdK` |
| **Confidential SOL (Solana)** | `J7bYB7CMVKnakNZxeDY6eG7KTHVryPdHmXdR3cbWRV4F` |
| **USDC Vault (Solana)** | `HgE9MCv5umddqVHaytfEMm4fNfquqRwW38Sa34DHgp9s` |


## Controls

- **Wrap**: Convert public ETH/USDC OR SOL/USDC to private cETH/cUSDC OR cSOL/cUSDC.
- **Swap**: Exchange encrypted tokens on Base OR solana.
- **Send**: Transfer private tokens to another wallet.
- **Unwrap**: Convert private tokens back to public ETH/USDC and SOL/USDC.
- **Bridge**: Cross-chain private transfers between Base and Solana [SOON].
- **Liquidity**: Add cETH/cUSDC to the pool (requires approval).

---
