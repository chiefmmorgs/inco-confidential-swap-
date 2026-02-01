"use strict";
/**
 * Inco Encryption Helper
 *
 * Handles encryption/decryption of amounts using Inco FHE
 * For full implementation, integrate @inco/solana-sdk when available
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncoEncryption = void 0;
/**
 * Mock encryption for development
 * Replace with actual Inco SDK calls in production
 */
class IncoEncryption {
    constructor(coValidatorUrl) {
        this.coValidatorUrl = coValidatorUrl || "https://testnet.inco.org";
    }
    /**
     * Encrypt an amount for on-chain storage
     * The encrypted value is a handle that Inco can operate on
     */
    async encrypt(amount) {
        // In production, this would call @inco/solana-sdk:
        // const { Lightning } = require("@inco/solana-sdk");
        // const lightning = new Lightning({ coValidatorUrl: this.coValidatorUrl });
        // const encrypted = await lightning.encrypt(amount);
        // return encrypted.handle;
        // For development, we'll create a mock encrypted handle
        // This is just the value - real encryption happens via Inco
        const value = typeof amount === "bigint" ? amount : BigInt(amount);
        // Mock: XOR with a constant to simulate encryption
        // DO NOT USE IN PRODUCTION - this is not real encryption!
        const mockKey = BigInt("0xDEADBEEFCAFEBABE1234567890ABCDEF");
        return value ^ mockKey;
    }
    /**
     * Request decryption of an encrypted handle
     * Only authorized users (with allowance) can decrypt
     */
    async decrypt(encryptedHandle) {
        // In production, this would call the Inco co-validator:
        // const { Lightning } = require("@inco/solana-sdk");
        // const lightning = new Lightning({ coValidatorUrl: this.coValidatorUrl });
        // const decrypted = await lightning.decrypt(encryptedHandle, userSignature);
        // return decrypted;
        // Mock: Reverse the XOR operation
        const mockKey = BigInt("0xDEADBEEFCAFEBABE1234567890ABCDEF");
        return encryptedHandle ^ mockKey;
    }
    /**
     * Encrypt multiple amounts in a batch
     */
    async encryptBatch(amounts) {
        return Promise.all(amounts.map((amt) => this.encrypt(amt)));
    }
}
exports.IncoEncryption = IncoEncryption;
exports.default = IncoEncryption;
