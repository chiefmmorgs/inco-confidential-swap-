import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import * as fs from "fs";

// Configuration
const PROGRAM_ID = new PublicKey("h6T7wsEJWMxN2uEZUc4SipEd8Zmz2DWasCDopindjC5");
const USDC_MINT = new PublicKey("G7EzuDs86oQX7ckv5AheQTBgas4UYFqD1Zorx3V3FhdK");
const RECIPIENT_WALLET = new PublicKey("ApMgYxRknwoMaSxRXtzkkYeEfP1QS7TGiXAheEsCQgm8");

async function main() {
    console.log("=== Create Token Account + Transfer ===\n");

    // Load wallet
    const walletPath = process.env.SOLANA_WALLET || `${process.env.HOME}/.config/solana/id.json`;
    const walletData = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
    const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
    console.log("Wallet:", wallet.publicKey.toBase58());

    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // Amount: 10000 USDC with 6 decimals
    const amount = 10000 * 1_000_000;
    console.log("Amount:", amount, "(10000 USDC)");
    console.log("Recipient wallet:", RECIPIENT_WALLET.toBase58());

    // Step 1: Create a token account for the recipient using initialize_account
    console.log("\n1. Creating Inco token account for recipient...");

    // Generate a new keypair for the recipient's token account
    const recipientTokenAccount = Keypair.generate();
    console.log("New token account:", recipientTokenAccount.publicKey.toBase58());

    // initialize_account discriminator from IDL: [74, 115, 99, 93, 197, 69, 103, 7]
    const initDiscriminator = new Uint8Array([74, 115, 99, 93, 197, 69, 103, 7]);
    const initData = Buffer.from(initDiscriminator);

    // Accounts for initialize_account:
    // 1. account (writable, signer) - the new token account
    // 2. mint - the token mint
    // 3. owner - the owner of the new account (recipient wallet)
    // 4. payer (writable, signer) - pays for account creation
    // 5. system_program

    const initAccountIx = new TransactionInstruction({
        keys: [
            { pubkey: recipientTokenAccount.publicKey, isSigner: true, isWritable: true }, // account (signer!)
            { pubkey: USDC_MINT, isSigner: false, isWritable: false }, // mint
            { pubkey: RECIPIENT_WALLET, isSigner: false, isWritable: false }, // owner
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // payer
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        ],
        programId: PROGRAM_ID,
        data: initData,
    });

    const tx1 = new Transaction().add(initAccountIx);
    const sig1 = await sendAndConfirmTransaction(connection, tx1, [wallet, recipientTokenAccount]);
    console.log("✅ Token account created:", sig1);

    // Step 2: Transfer the 10000 cUSDC to the new account
    console.log("\n2. Transferring 10000 cUSDC...");

    const SOURCE_ACCOUNT = new PublicKey("CY8N8fDMaB88E39m9TWMycX9LShMEV6HkSWN5NpU2SBt");

    // transfer discriminator from IDL: [163, 52, 200, 231, 140, 3, 69, 186]
    const transferDiscriminator = new Uint8Array([163, 52, 200, 231, 140, 3, 69, 186]);

    const amountBytes = new Uint8Array(16);
    const amountBigInt = BigInt(amount);
    for (let i = 0; i < 16; i++) {
        amountBytes[i] = Number((amountBigInt >> BigInt(i * 8)) & BigInt(0xff));
    }

    const transferData = Buffer.concat([
        Buffer.from(transferDiscriminator),
        Buffer.from(amountBytes)
    ]);

    const transferInstruction = new TransactionInstruction({
        keys: [
            { pubkey: SOURCE_ACCOUNT, isSigner: false, isWritable: true }, // source
            { pubkey: recipientTokenAccount.publicKey, isSigner: false, isWritable: true }, // destination
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // authority
        ],
        programId: PROGRAM_ID,
        data: transferData,
    });

    const tx2 = new Transaction().add(transferInstruction);
    const sig2 = await sendAndConfirmTransaction(connection, tx2, [wallet]);
    console.log("✅ Transfer TX:", sig2);

    console.log("\n=== Complete! ===");
    console.log("Recipient wallet:", RECIPIENT_WALLET.toBase58());
    console.log("Recipient token account:", recipientTokenAccount.publicKey.toBase58());
    console.log("Amount: 10000 cUSDC (encrypted)");
    console.log("\n⚠️ SAVE THIS TOKEN ACCOUNT ADDRESS - needed to receive transfers!");
}

main().catch(console.error);
