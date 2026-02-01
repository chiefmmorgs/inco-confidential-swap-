/**
 * Inco Encryption Helper
 *
 * Handles encryption/decryption of amounts using Inco FHE
 * For full implementation, integrate @inco/solana-sdk when available
 */
export interface EncryptionResult {
    ciphertext: Uint8Array;
    handle: bigint;
}
/**
 * Mock encryption for development
 * Replace with actual Inco SDK calls in production
 */
export declare class IncoEncryption {
    private coValidatorUrl;
    constructor(coValidatorUrl?: string);
    /**
     * Encrypt an amount for on-chain storage
     * The encrypted value is a handle that Inco can operate on
     */
    encrypt(amount: number | bigint): Promise<bigint>;
    /**
     * Request decryption of an encrypted handle
     * Only authorized users (with allowance) can decrypt
     */
    decrypt(encryptedHandle: bigint): Promise<bigint>;
    /**
     * Encrypt multiple amounts in a batch
     */
    encryptBatch(amounts: (number | bigint)[]): Promise<bigint[]>;
}
export default IncoEncryption;
