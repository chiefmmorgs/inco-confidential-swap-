/**
 * Deployment Script for Confidential SPL Token Program
 * 
 * Prerequisites:
 * 1. Rust installed (https://rustup.rs/)
 * 2. Solana CLI installed (https://docs.solana.com/cli/install-solana-cli-tools)
 * 3. Anchor CLI installed (avm install latest && avm use latest)
 * 4. A funded wallet for Devnet
 * 
 * Steps:
 * 1. Configure Solana CLI for Devnet:
 *    solana config set --url https://api.devnet.solana.com
 * 
 * 2. Create or use existing keypair:
 *    solana-keygen new -o ~/.config/solana/id.json
 * 
 * 3. Airdrop SOL for deployment:
 *    solana airdrop 2
 * 
 * 4. Build the program:
 *    anchor build
 * 
 * 5. Get the generated program ID:
 *    solana address -k target/deploy/inco_token-keypair.json
 * 
 * 6. Update the program ID in:
 *    - programs/inco-token/src/lib.rs (declare_id!)
 *    - Anchor.toml
 * 
 * 7. Rebuild with correct ID:
 *    anchor build
 * 
 * 8. Deploy to Devnet:
 *    anchor deploy --provider.cluster devnet
 * 
 * 9. Verify deployment:
 *    solana program show <PROGRAM_ID>
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

async function main() {
    console.log("🚀 Inco Confidential Token Deployment Script\n");

    // Connect to Devnet
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    console.log("Connected to Solana Devnet");

    // Load wallet
    const walletPath = process.env.WALLET_PATH || path.join(
        process.env.HOME || process.env.USERPROFILE || "",
        ".config/solana/id.json"
    );

    let wallet: Keypair;
    try {
        const walletData = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
        wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
        console.log("Wallet loaded:", wallet.publicKey.toString());
    } catch (e) {
        console.error("❌ Failed to load wallet from", walletPath);
        console.log("Run: solana-keygen new -o ~/.config/solana/id.json");
        process.exit(1);
    }

    // Check balance
    const balance = await connection.getBalance(wallet.publicKey);
    console.log("Balance:", balance / LAMPORTS_PER_SOL, "SOL\n");

    if (balance < 0.5 * LAMPORTS_PER_SOL) {
        console.log("⚠️  Low balance! Requesting airdrop...");
        try {
            const sig = await connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
            await connection.confirmTransaction(sig);
            console.log("✅ Airdrop successful!\n");
        } catch (e) {
            console.log("❌ Airdrop failed. Please fund wallet manually:");
            console.log("   solana airdrop 2");
        }
    }

    // Check for program keypair
    const programKeypairPath = path.join(__dirname, "../target/deploy/inco_token-keypair.json");
    if (fs.existsSync(programKeypairPath)) {
        const programData = JSON.parse(fs.readFileSync(programKeypairPath, "utf-8"));
        const programKeypair = Keypair.fromSecretKey(Uint8Array.from(programData));
        console.log("📦 Program ID:", programKeypair.publicKey.toString());
        console.log("\nUpdate this ID in:");
        console.log("  - programs/inco-token/src/lib.rs (declare_id!)");
        console.log("  - Anchor.toml [programs.devnet]");
    } else {
        console.log("⚠️  No program keypair found. Run 'anchor build' first.");
    }

    console.log("\n---");
    console.log("📋 Deployment Checklist:");
    console.log("  [ ] 1. anchor build");
    console.log("  [ ] 2. Update program ID in lib.rs and Anchor.toml");
    console.log("  [ ] 3. anchor build (rebuild with new ID)");
    console.log("  [ ] 4. anchor deploy --provider.cluster devnet");
    console.log("  [ ] 5. Update frontend crosschain-config.ts with program ID");
}

main().catch(console.error);
