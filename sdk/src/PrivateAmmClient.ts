import {
    Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
    SystemProgram,
    Keypair,
} from "@solana/web3.js";
import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import { PROGRAM_IDS, SEEDS, RPC_ENDPOINTS } from "./constants";

export interface PrivateAmmConfig {
    rpcEndpoint?: string;
    wallet: any; // Wallet adapter
}

export interface Pool {
    address: PublicKey;
    tokenAMint: PublicKey;
    tokenBMint: PublicKey;
    feeBps: number;
    authority: PublicKey;
}

export interface SwapParams {
    pool: PublicKey;
    encryptedAmountIn: bigint;
    encryptedMinOut: bigint;
    direction: boolean; // true = A→B, false = B→A
}

export interface AddLiquidityParams {
    pool: PublicKey;
    encryptedAmountA: bigint;
    encryptedAmountB: bigint;
}

/**
 * Private AMM Client
 * Interact with the fully private AMM on Solana
 */
export class PrivateAmmClient {
    private connection: Connection;
    private wallet: any;
    private program: Program | null = null;

    constructor(config: PrivateAmmConfig) {
        this.connection = new Connection(
            config.rpcEndpoint || RPC_ENDPOINTS.DEVNET,
            "confirmed"
        );
        this.wallet = config.wallet;
    }

    /**
     * Derive pool PDA address
     */
    async getPoolAddress(
        tokenAMint: PublicKey,
        tokenBMint: PublicKey
    ): Promise<[PublicKey, number]> {
        return PublicKey.findProgramAddressSync(
            [SEEDS.POOL, tokenAMint.toBuffer(), tokenBMint.toBuffer()],
            PROGRAM_IDS.PRIVATE_AMM
        );
    }

    /**
     * Derive user position PDA
     */
    async getUserPositionAddress(
        pool: PublicKey,
        user: PublicKey
    ): Promise<[PublicKey, number]> {
        return PublicKey.findProgramAddressSync(
            [SEEDS.POSITION, pool.toBuffer(), user.toBuffer()],
            PROGRAM_IDS.PRIVATE_AMM
        );
    }

    /**
     * Derive swap result PDA
     */
    async getSwapResultAddress(
        pool: PublicKey,
        user: PublicKey
    ): Promise<[PublicKey, number]> {
        return PublicKey.findProgramAddressSync(
            [SEEDS.SWAP_RESULT, pool.toBuffer(), user.toBuffer()],
            PROGRAM_IDS.PRIVATE_AMM
        );
    }

    /**
     * Initialize a new private liquidity pool
     */
    async initializePool(
        tokenAMint: PublicKey,
        tokenBMint: PublicKey,
        feeBps: number
    ): Promise<string> {
        const [poolAddress] = await this.getPoolAddress(tokenAMint, tokenBMint);

        // Build initialize_pool instruction
        const keys = [
            { pubkey: poolAddress, isSigner: false, isWritable: true },
            { pubkey: tokenAMint, isSigner: false, isWritable: false },
            { pubkey: tokenBMint, isSigner: false, isWritable: false },
            { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: PROGRAM_IDS.INCO_LIGHTNING, isSigner: false, isWritable: false },
        ];

        // Discriminator for initialize_pool (first 8 bytes of sha256("global:initialize_pool"))
        const discriminator = Buffer.from([95, 180, 10, 172, 84, 174, 232, 40]);
        const feeData = Buffer.alloc(2);
        feeData.writeUInt16LE(feeBps, 0);

        const data = Buffer.concat([discriminator, feeData]);

        const ix = new TransactionInstruction({
            keys,
            programId: PROGRAM_IDS.PRIVATE_AMM,
            data,
        });

        const tx = new Transaction().add(ix);
        const signature = await this.wallet.sendTransaction(tx, this.connection);
        await this.connection.confirmTransaction(signature, "confirmed");

        console.log(`Pool initialized: ${poolAddress.toString()}`);
        return signature;
    }

    /**
     * Add liquidity to a pool (encrypted amounts)
     */
    async addLiquidity(params: AddLiquidityParams): Promise<string> {
        const [userPosition] = await this.getUserPositionAddress(
            params.pool,
            this.wallet.publicKey
        );

        const keys = [
            { pubkey: params.pool, isSigner: false, isWritable: true },
            { pubkey: userPosition, isSigner: false, isWritable: true },
            { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: PROGRAM_IDS.INCO_LIGHTNING, isSigner: false, isWritable: false },
        ];

        // Discriminator for add_liquidity
        const discriminator = Buffer.from([181, 157, 89, 67, 143, 182, 52, 72]);
        const amountAData = Buffer.alloc(16);
        const amountBData = Buffer.alloc(16);

        // Write BigInts as little-endian 128-bit
        this.writeBigInt128LE(amountAData, params.encryptedAmountA);
        this.writeBigInt128LE(amountBData, params.encryptedAmountB);

        const data = Buffer.concat([discriminator, amountAData, amountBData]);

        const ix = new TransactionInstruction({
            keys,
            programId: PROGRAM_IDS.PRIVATE_AMM,
            data,
        });

        const tx = new Transaction().add(ix);
        const signature = await this.wallet.sendTransaction(tx, this.connection);
        await this.connection.confirmTransaction(signature, "confirmed");

        console.log(`Liquidity added (encrypted)`);
        return signature;
    }

    /**
     * Execute a private swap
     * All amounts are encrypted - no one can see trade size!
     */
    async swap(params: SwapParams): Promise<string> {
        const [swapResult] = await this.getSwapResultAddress(
            params.pool,
            this.wallet.publicKey
        );

        const keys = [
            { pubkey: params.pool, isSigner: false, isWritable: true },
            { pubkey: swapResult, isSigner: false, isWritable: true },
            { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: PROGRAM_IDS.INCO_LIGHTNING, isSigner: false, isWritable: false },
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

        const ix = new TransactionInstruction({
            keys,
            programId: PROGRAM_IDS.PRIVATE_AMM,
            data,
        });

        const tx = new Transaction().add(ix);
        const signature = await this.wallet.sendTransaction(tx, this.connection);
        await this.connection.confirmTransaction(signature, "confirmed");

        console.log(`Private swap executed (amounts hidden!)`);
        return signature;
    }

    /**
     * Fetch pool info
     */
    async getPool(poolAddress: PublicKey): Promise<Pool | null> {
        const accountInfo = await this.connection.getAccountInfo(poolAddress);
        if (!accountInfo) return null;

        // Parse pool data (skip 8-byte discriminator)
        const data = accountInfo.data.slice(8);

        return {
            address: poolAddress,
            tokenAMint: new PublicKey(data.slice(0, 32)),
            tokenBMint: new PublicKey(data.slice(32, 64)),
            // Encrypted reserves are not readable - only Inco can decrypt
            feeBps: data.readUInt16LE(64 + 64), // After 4 Euint128 fields
            authority: new PublicKey(data.slice(64 + 64 + 2, 64 + 64 + 2 + 32)),
        };
    }

    // Helper: Write BigInt as 128-bit little-endian
    private writeBigInt128LE(buffer: Buffer, value: bigint): void {
        for (let i = 0; i < 16; i++) {
            buffer[i] = Number((value >> BigInt(i * 8)) & BigInt(0xff));
        }
    }
}

export default PrivateAmmClient;
