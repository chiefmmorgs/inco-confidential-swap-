import { PublicKey } from "@solana/web3.js";
export interface PrivateAmmConfig {
    rpcEndpoint?: string;
    wallet: any;
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
    direction: boolean;
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
export declare class PrivateAmmClient {
    private connection;
    private wallet;
    private program;
    constructor(config: PrivateAmmConfig);
    /**
     * Derive pool PDA address
     */
    getPoolAddress(tokenAMint: PublicKey, tokenBMint: PublicKey): Promise<[PublicKey, number]>;
    /**
     * Derive user position PDA
     */
    getUserPositionAddress(pool: PublicKey, user: PublicKey): Promise<[PublicKey, number]>;
    /**
     * Derive swap result PDA
     */
    getSwapResultAddress(pool: PublicKey, user: PublicKey): Promise<[PublicKey, number]>;
    /**
     * Initialize a new private liquidity pool
     */
    initializePool(tokenAMint: PublicKey, tokenBMint: PublicKey, feeBps: number): Promise<string>;
    /**
     * Add liquidity to a pool (encrypted amounts)
     */
    addLiquidity(params: AddLiquidityParams): Promise<string>;
    /**
     * Execute a private swap
     * All amounts are encrypted - no one can see trade size!
     */
    swap(params: SwapParams): Promise<string>;
    /**
     * Fetch pool info
     */
    getPool(poolAddress: PublicKey): Promise<Pool | null>;
    private writeBigInt128LE;
}
export default PrivateAmmClient;
