"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivateAmmClient = void 0;
const web3_js_1 = require("@solana/web3.js");
const constants_1 = require("./constants");
/**
 * Private AMM Client
 * Interact with the fully private AMM on Solana
 */
class PrivateAmmClient {
    constructor(config) {
        this.program = null;
        this.connection = new web3_js_1.Connection(config.rpcEndpoint || constants_1.RPC_ENDPOINTS.DEVNET, "confirmed");
        this.wallet = config.wallet;
    }
    /**
     * Derive pool PDA address
     */
    async getPoolAddress(tokenAMint, tokenBMint) {
        return web3_js_1.PublicKey.findProgramAddressSync([constants_1.SEEDS.POOL, tokenAMint.toBuffer(), tokenBMint.toBuffer()], constants_1.PROGRAM_IDS.PRIVATE_AMM);
    }
    /**
     * Derive user position PDA
     */
    async getUserPositionAddress(pool, user) {
        return web3_js_1.PublicKey.findProgramAddressSync([constants_1.SEEDS.POSITION, pool.toBuffer(), user.toBuffer()], constants_1.PROGRAM_IDS.PRIVATE_AMM);
    }
    /**
     * Derive swap result PDA
     */
    async getSwapResultAddress(pool, user) {
        return web3_js_1.PublicKey.findProgramAddressSync([constants_1.SEEDS.SWAP_RESULT, pool.toBuffer(), user.toBuffer()], constants_1.PROGRAM_IDS.PRIVATE_AMM);
    }
    /**
     * Initialize a new private liquidity pool
     */
    async initializePool(tokenAMint, tokenBMint, feeBps) {
        const [poolAddress] = await this.getPoolAddress(tokenAMint, tokenBMint);
        // Build initialize_pool instruction
        const keys = [
            { pubkey: poolAddress, isSigner: false, isWritable: true },
            { pubkey: tokenAMint, isSigner: false, isWritable: false },
            { pubkey: tokenBMint, isSigner: false, isWritable: false },
            { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: constants_1.PROGRAM_IDS.INCO_LIGHTNING, isSigner: false, isWritable: false },
        ];
        // Discriminator for initialize_pool (first 8 bytes of sha256("global:initialize_pool"))
        const discriminator = Buffer.from([95, 180, 10, 172, 84, 174, 232, 40]);
        const feeData = Buffer.alloc(2);
        feeData.writeUInt16LE(feeBps, 0);
        const data = Buffer.concat([discriminator, feeData]);
        const ix = new web3_js_1.TransactionInstruction({
            keys,
            programId: constants_1.PROGRAM_IDS.PRIVATE_AMM,
            data,
        });
        const tx = new web3_js_1.Transaction().add(ix);
        const signature = await this.wallet.sendTransaction(tx, this.connection);
        await this.connection.confirmTransaction(signature, "confirmed");
        console.log(`Pool initialized: ${poolAddress.toString()}`);
        return signature;
    }
    /**
     * Add liquidity to a pool (encrypted amounts)
     */
    async addLiquidity(params) {
        const [userPosition] = await this.getUserPositionAddress(params.pool, this.wallet.publicKey);
        const keys = [
            { pubkey: params.pool, isSigner: false, isWritable: true },
            { pubkey: userPosition, isSigner: false, isWritable: true },
            { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: constants_1.PROGRAM_IDS.INCO_LIGHTNING, isSigner: false, isWritable: false },
        ];
        // Discriminator for add_liquidity
        const discriminator = Buffer.from([181, 157, 89, 67, 143, 182, 52, 72]);
        const amountAData = Buffer.alloc(16);
        const amountBData = Buffer.alloc(16);
        // Write BigInts as little-endian 128-bit
        this.writeBigInt128LE(amountAData, params.encryptedAmountA);
        this.writeBigInt128LE(amountBData, params.encryptedAmountB);
        const data = Buffer.concat([discriminator, amountAData, amountBData]);
        const ix = new web3_js_1.TransactionInstruction({
            keys,
            programId: constants_1.PROGRAM_IDS.PRIVATE_AMM,
            data,
        });
        const tx = new web3_js_1.Transaction().add(ix);
        const signature = await this.wallet.sendTransaction(tx, this.connection);
        await this.connection.confirmTransaction(signature, "confirmed");
        console.log(`Liquidity added (encrypted)`);
        return signature;
    }
    /**
     * Execute a private swap
     * All amounts are encrypted - no one can see trade size!
     */
    async swap(params) {
        const [swapResult] = await this.getSwapResultAddress(params.pool, this.wallet.publicKey);
        const keys = [
            { pubkey: params.pool, isSigner: false, isWritable: true },
            { pubkey: swapResult, isSigner: false, isWritable: true },
            { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: constants_1.PROGRAM_IDS.INCO_LIGHTNING, isSigner: false, isWritable: false },
        ];
        // Discriminator for swap
        const discriminator = Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]);
        const amountInData = Buffer.alloc(16);
        const minOutData = Buffer.alloc(16);
        const directionData = Buffer.alloc(1);
        this.writeBigInt128LE(amountInData, params.encryptedAmountIn);
        this.writeBigInt128LE(minOutData, params.encryptedMinOut);
        directionData.writeUInt8(params.direction ? 1 : 0, 0);
        const data = Buffer.concat([
            discriminator,
            amountInData,
            minOutData,
            directionData,
        ]);
        const ix = new web3_js_1.TransactionInstruction({
            keys,
            programId: constants_1.PROGRAM_IDS.PRIVATE_AMM,
            data,
        });
        const tx = new web3_js_1.Transaction().add(ix);
        const signature = await this.wallet.sendTransaction(tx, this.connection);
        await this.connection.confirmTransaction(signature, "confirmed");
        console.log(`Private swap executed (amounts hidden!)`);
        return signature;
    }
    /**
     * Fetch pool info
     */
    async getPool(poolAddress) {
        const accountInfo = await this.connection.getAccountInfo(poolAddress);
        if (!accountInfo)
            return null;
        // Parse pool data (skip 8-byte discriminator)
        const data = accountInfo.data.slice(8);
        return {
            address: poolAddress,
            tokenAMint: new web3_js_1.PublicKey(data.slice(0, 32)),
            tokenBMint: new web3_js_1.PublicKey(data.slice(32, 64)),
            // Encrypted reserves are not readable - only Inco can decrypt
            feeBps: data.readUInt16LE(64 + 64), // After 4 Euint128 fields
            authority: new web3_js_1.PublicKey(data.slice(64 + 64 + 2, 64 + 64 + 2 + 32)),
        };
    }
    // Helper: Write BigInt as 128-bit little-endian
    writeBigInt128LE(buffer, value) {
        for (let i = 0; i < 16; i++) {
            buffer[i] = Number((value >> BigInt(i * 8)) & BigInt(0xff));
        }
    }
}
exports.PrivateAmmClient = PrivateAmmClient;
exports.default = PrivateAmmClient;
