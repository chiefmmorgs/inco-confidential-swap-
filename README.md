# 🕹️ Retro Inco Confidential Swap

> **Privacy-first DEX on Base Sepolia powered by Inco Network's FHE technology.**

![Retro Inco Swap](https://placehold.co/1200x600/050510/00f0ff?text=RETRO+INCO+SWAP)

A decentralized exchange and private transfer application built with a cyberpunk/vaporwave aesthetic. This project demonstrates how to build confidentiality-enabled interaction on EVM chains using Inco's Fully Homomorphic Encryption (FHE).

## ✨ Features

### 🔒 Confidential Swaps
- Swap **cUSDC** and **cETH** with completely encrypted amounts.
- Input values are encrypted client-side using the Inco SDK.
- On-chain balances remain hidden from the public eye.

### 🕵️ Shadow Transfer
- Send encrypted tokens to any address securely.
- Uses `transfer(address, bytes)` overloaded function to handle encrypted inputs.
- Only the sender and receiver can view the transferred value.

### 📼 Retro UI/UX
- **CRT Scanline Effects**: Fully animated screen overlay for that 90s monitor feel.
- **Neon Aesthetics**: High-contrast neon blue, purple, and green palette.
- **Pixel Art**: Custom "Press Start 2P" typography and 8-bit design elements.
- **Interactive**: Terminal-style inputs and glitch effects.

## 🛠️ Technology Stack

- **Frontend**: Next.js 14, Tailwind CSS, TypeScript
- **Encryption**: `@inco/js` (FHE SDK)
- **Blockchain**: Base Sepolia (Dapp), Inco Network (Confidential Computing)
- **Contracts**: Solidity v0.8.20+, OpenZeppelin
- **Libraries**: `wagmi`, `viem`, `@tanstack/react-query`

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MetaMask Wallet (connected to Base Sepolia)

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

## 📜 Smart Contracts (Base Sepolia)

| Contract | Address |
|----------|---------|
| **Confidential ETH** | `0x525c34cb249826f74352D086d494957920B2F2E4` |
| **Confidential USDC** | `0x789d6e7f86641829636605d8f64483d735165d70` |
| **Confidential Swap** | `0xfDE351E7d8B90731F2A70cf076A10f7605D4122d` |

## ☀️ Cross-Chain Bridge (Base ↔ Solana)

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
| **Inco Lightning Program** | `5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj` |
| **Confidential USDC (Solana)** | *Coming Soon* |

## 🕹️ Controls

- **Wrap**: Convert public ETH/USDC to private cETH/cUSDC.
- **Swap**: Exchange encrypted tokens on Base.
- **Send**: Transfer private tokens to another wallet.
- **Unwrap**: Convert private tokens back to public ETH/USDC.
- **Bridge**: Cross-chain private transfers between Base and Solana.
- **Liquidity**: Add cETH/cUSDC to the pool (requires approval).

---

*Built with ❤️ for the Inco Network Hackathon*
