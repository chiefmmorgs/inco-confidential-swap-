# 🕹️ Inco Confidential Swap

> **Privacy-first DEX on Base Sepolia powered by Inco Network's FHE technology.**

https://inco-confidential-swap.vercel.app/

A decentralized exchange and private transfer application. This project demonstrates how to build confidentiality-enabled interaction on EVM chains using Inco's Fully Homomorphic Encryption (FHE).

## ✨ Features

### 🔒 Confidential Swaps
- Swap **cUSDC** and **cETH** with completely encrypted amounts.
- Input values are encrypted client-side using the Inco SDK.
- On-chain balances remain hidden from the public eye.

### 🕵️ Shadow Transfer
- Send encrypted tokens to any address securely.
- Uses `transfer(address, bytes)` overloaded function to handle encrypted inputs.
- Only the sender and receiver can view the transferred value.


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

## 🕹️ Controls

- **Wrap**: Convert public ETH/USDC to private cETH/cUSDC.
- **Swap**: Exchange encrypted tokens.
- **Send**: Transfer private tokens to another wallet.
- **Unwrap**: Convert private tokens back to public ETH/USDC.
- **Liquidity**: Add cETH/cUSDC to the pool (requires approval).

---

*Built with ❤️ for the Inco Network*
