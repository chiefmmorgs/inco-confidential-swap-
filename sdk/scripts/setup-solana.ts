import {
    Connection,
    Keypair,
    PublicKey,
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

// Load IDL
const IDL_PATH = path.join(__dirname, "../../solana/target/idl/inco_token.json");
const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));

// Program IDs
const INCO_TOKEN_PROGRAM = new PublicKey("h6T7wsEJWMxN2uEZUc4SipEd8Zmz2DWasCDopindjC5");

async function initializeMintAndAccount(
    program: any,
    payer: Keypair,
    name: string,
    decimals: number
) {
    console.log(`\n🪙 Setting up ${name} (${decimals} decimals)...`);

    // Generate mint keypair
    const mintKeypair = Keypair.generate();
    console.log(`   Mint: ${mintKeypair.publicKey.toString()}`);

    // Initialize Mint
    try {
        const tx = await program.methods
            .initializeMint(
                decimals,
                payer.publicKey, // mint_authority
                null // freeze_authority
            )
            .accounts({
                mint: mintKeypair.publicKey,
                payer: payer.publicKey,
                systemProgram: new PublicKey("11111111111111111111111111111111"),
            })
            .signers([mintKeypair])
            .rpc();
        console.log(`   ✅ Mint initialized: ${tx.slice(0, 20)}...`);
    } catch (err: any) {
        console.log(`   ⚠️ Mint error: ${err.message}`);
    }

    // Initialize User Account
    const userAccountKeypair = Keypair.generate();
    console.log(`   Account: ${userAccountKeypair.publicKey.toString()}`);

    try {
        const tx = await program.methods
            .initializeAccount()
            .accounts({
                account: userAccountKeypair.publicKey,
                mint: mintKeypair.publicKey,
                owner: payer.publicKey,
                payer: payer.publicKey,
                systemProgram: new PublicKey("11111111111111111111111111111111"),
            })
            .signers([userAccountKeypair])
            .rpc();
        console.log(`   ✅ Account initialized: ${tx.slice(0, 20)}...`);
    } catch (err: any) {
        console.log(`   ⚠️ Account error: ${err.message}`);
    }

    // Mint initial tokens
    try {
        const initialAmount = new BN("1000000000000"); // 1000 tokens
        const tx = await program.methods
            .mintTo(initialAmount)
            .accounts({
                mint: mintKeypair.publicKey,
                account: userAccountKeypair.publicKey,
                mintAuthority: payer.publicKey,
            })
            .rpc();
        console.log(`   ✅ Initial supply minted: ${tx.slice(0, 20)}...`);
    } catch (err: any) {
        console.log(`   ⚠️ Mint tokens error: ${err.message}`);
    }

    return {
        mint: mintKeypair.publicKey.toString(),
        userAccount: userAccountKeypair.publicKey.toString(),
    };
}

async function main() {
    console.log("🔐 Inco Token Setup Script - SOL & USDC");
    console.log("=======================================\n");

    // Load wallet
    const keypairPath = process.env.HOME + "/.config/solana/id.json";
    if (!fs.existsSync(keypairPath)) {
        console.error("❌ No Solana keypair found at", keypairPath);
        console.log("Run: solana-keygen new");
        process.exit(1);
    }

    const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
    console.log("👛 Wallet:", payer.publicKey.toString());

    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const balance = await connection.getBalance(payer.publicKey);
    console.log("💰 Balance:", balance / LAMPORTS_PER_SOL, "SOL");

    if (balance < 0.5 * LAMPORTS_PER_SOL) {
        console.log("\n⚠️ Low balance. Getting airdrop...");
        const sig = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig);
        console.log("✅ Airdrop received!");
    }

    // Create Anchor provider
    const wallet = new Wallet(payer);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const program = new Program(idl, provider);
    console.log("📦 Program:", program.programId.toString());

    // Initialize SOL mint (9 decimals like native SOL)
    const solConfig = await initializeMintAndAccount(program, payer, "cSOL", 9);

    // Initialize USDC mint (6 decimals like real USDC)
    const usdcConfig = await initializeMintAndAccount(program, payer, "cUSDC", 6);

    // Save config
    const config = {
        solMint: solConfig.mint,
        solAccount: solConfig.userAccount,
        usdcMint: usdcConfig.mint,
        usdcAccount: usdcConfig.userAccount,
        mintAuthority: payer.publicKey.toString(),
        program: INCO_TOKEN_PROGRAM.toString(),
    };

    const configPath = path.join(__dirname, "solana-config.json");
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("\n💾 Config saved to:", configPath);

    console.log("\n✅ Setup Complete!");
    console.log("==================");
    console.log("cSOL Mint:", config.solMint);
    console.log("cSOL Account:", config.solAccount);
    console.log("cUSDC Mint:", config.usdcMint);
    console.log("cUSDC Account:", config.usdcAccount);
    console.log("Authority:", config.mintAuthority);
    console.log("\n🎯 Update frontend with these addresses!");
}

main().catch(console.error);
