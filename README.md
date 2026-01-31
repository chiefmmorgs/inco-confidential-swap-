# 🔐 Inco Confidential SPL Token (Solana)

> Privacy-preserving SPL Token Program using Inco Lightning FHE on Solana Devnet.

## 🏗️ Project Structure

```
solana/
├── Anchor.toml           # Anchor configuration
├── Cargo.toml            # Workspace configuration
├── package.json          # Node.js dependencies
├── programs/
│   └── inco-token/       # Confidential SPL Token program
│       ├── Cargo.toml
│       └── src/lib.rs
├── scripts/
│   └── deploy.ts         # Deployment helper script
└── tests/
    └── inco-token.ts     # Integration tests
```

## 📋 Prerequisites

1. **Rust** - Install from https://rustup.rs/
2. **Solana CLI** - Install:
   ```bash
   sh -c "$(curl -sSfL https://release.solana.com/v1.18.8/install)"
   ```
3. **Anchor CLI** - Install:
   ```bash
   cargo install --git https://github.com/coral-xyz/anchor avm --locked
   avm install latest
   avm use latest
   ```

## 🚀 Deployment

### 1. Configure Solana CLI
```bash
solana config set --url https://api.devnet.solana.com
solana-keygen new -o ~/.config/solana/id.json  # Skip if you have one
solana airdrop 2
```

### 2. Build Program
```bash
cd solana
anchor build
```

### 3. Get Program ID
```bash
solana address -k target/deploy/inco_token-keypair.json
```

### 4. Update Program ID
Edit the program ID in:
- `programs/inco-token/src/lib.rs` → `declare_id!("YOUR_PROGRAM_ID")`
- `Anchor.toml` → `[programs.devnet] inco_token = "YOUR_PROGRAM_ID"`

### 5. Rebuild & Deploy
```bash
anchor build
anchor deploy --provider.cluster devnet
```

### 6. Verify
```bash
solana program show <PROGRAM_ID>
```

## 🧪 Testing

```bash
npm install
anchor test
```

## 📡 Inco Lightning Integration

This program integrates with **Inco Lightning** for FHE (Fully Homomorphic Encryption):

| Component | Address |
|-----------|---------|
| Inco Lightning Program | `5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj` |
| Co-validator Endpoint | `https://grpc.solana-devnet.alpha.devnet.inco.org` |

## 🔧 Program Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize_mint` | Create a new confidential token mint |
| `initialize_account` | Create a token account for a user |
| `mint_to` | Mint tokens with encrypted amount |
| `transfer` | Transfer tokens with encrypted amount |
| `burn` | Burn tokens with encrypted amount |
| `freeze_account` | Freeze a token account |
| `thaw_account` | Unfreeze a frozen account |
| `close_account` | Close an empty account |

---

*Part of the Inco Confidential Swap project*
