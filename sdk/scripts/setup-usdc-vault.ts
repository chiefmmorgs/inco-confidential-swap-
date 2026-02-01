import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    TransactionInstruction,
    SystemProgram,
    sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";

// Program ID
const INCO_TOKEN_PROGRAM = new PublicKey("h6T7wsEJWMxN2uEZUc4SipEd8Zmz2DWasCDopindjC5");

// Discriminators from IDL
const INITIALIZE_USDC_VAULT_DISCRIMINATOR = Buffer.from([186, 93, 213, 60, 171, 158, 253, 207]);

async function main() {
    console.log("🏦 USDC Vault Setup Script");
    console.log("==========================\n");

    // Load wallet
    const keypairPath = process.env.HOME + "/.config/solana/id.json";
    if (!fs.existsSync(keypairPath)) {
        console.error("❌ No Solana keypair found at", keypairPath);
        process.exit(1);
    }
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    console.log("💳 Payer:", payer.publicKey.toString());

    // Connect to devnet
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const balance = await connection.getBalance(payer.publicKey);
    console.log(`💰 Balance: ${balance / 1e9} SOL\n`);

    // Step 1: Create SPL USDC Token Mint
    console.log("📝 Step 1: Creating SPL USDC Token Mint...");
    let usdcMint: PublicKey;

    try {
        usdcMint = await createMint(
            connection,
            payer,           // payer
            payer.publicKey, // mint authority
            null,            // freeze authority
            6,               // decimals (USDC has 6)
        );
        console.log(`   ✅ SPL USDC Mint: ${usdcMint.toString()}`);
    } catch (err: any) {
        console.error("   ❌ Failed to create mint:", err.message);
        process.exit(1);
    }

    // Step 2: Derive USDC Vault PDA
    console.log("\n📝 Step 2: Deriving USDC Vault PDA...");
    const [usdcVaultPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("usdc_vault")],
        INCO_TOKEN_PROGRAM
    );
    console.log(`   Vault PDA: ${usdcVaultPda.toString()}`);
    console.log(`   Bump: ${bump}`);

    // Step 3: Initialize USDC Vault
    console.log("\n📝 Step 3: Initializing USDC Vault...");
    try {
        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: usdcVaultPda, isSigner: false, isWritable: true },
                { pubkey: usdcMint, isSigner: false, isWritable: false },
                { pubkey: payer.publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            ],
            programId: INCO_TOKEN_PROGRAM,
            data: INITIALIZE_USDC_VAULT_DISCRIMINATOR,
        });

        const transaction = new Transaction().add(instruction);
        const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);
        console.log(`   ✅ Vault initialized: ${signature.slice(0, 20)}...`);
    } catch (err: any) {
        console.error("   ❌ Failed to initialize vault:", err.message);
        if (err.logs) {
            console.log("   Logs:", err.logs.slice(-5));
        }
        // Continue - vault might already exist
    }

    // Step 4: Mint USDC to vault (so unwraps can work)
    console.log("\n📝 Step 4: Minting USDC to vault for unwrap liquidity...");
    try {
        // First, let's mint to an ATA and then we can transfer
        // Actually for this vault setup, users will need to wrap first
        // Or we mint directly to the vault PDA

        // Mint 10,000 USDC to the vault for liquidity
        const amountToMint = 10_000_000_000; // 10,000 USDC (6 decimals)

        // We need to mint to the vault's token account address
        // The vault IS the token account in our design
        await mintTo(
            connection,
            payer,
            usdcMint,
            usdcVaultPda, // Mint directly to vault
            payer,        // mint authority
            amountToMint
        );
        console.log(`   ✅ Minted 10,000 USDC to vault`);
    } catch (err: any) {
        console.error("   ⚠️ Could not mint to vault:", err.message);
        console.log("   Note: Vault needs to be initialized as token account first");
    }

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("📋 SETUP COMPLETE - Update frontend with these values:");
    console.log("=".repeat(50));
    console.log(`
    // Add to SOLANA_CONFIG in page.tsx:
    splUsdcMint: new PublicKey("${usdcMint.toString()}"),
    usdcVault: new PublicKey("${usdcVaultPda.toString()}"),
    `);
}

main().catch(console.error);
