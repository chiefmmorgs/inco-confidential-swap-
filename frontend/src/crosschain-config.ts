/**
 * Cross-Chain Configuration
 * Supports Base Sepolia (EVM) ↔ Solana Devnet bridging
 */

export const CROSSCHAIN_CONFIG = {
    // Supported Chains
    chains: {
        baseSepolia: {
            id: 84532,
            name: "Base Sepolia",
            type: "evm" as const,
            rpc: "https://sepolia.base.org",
            currency: "ETH",
            explorer: "https://sepolia.basescan.org",
        },
        solanaDevnet: {
            id: "solana-devnet",
            name: "Solana Devnet",
            type: "svm" as const,
            rpc: "https://api.devnet.solana.com",
            currency: "SOL",
            explorer: "https://explorer.solana.com/?cluster=devnet",
        },
    },

    // Token Mappings (Base <-> Solana equivalents)
    tokens: {
        USDC: {
            baseSepolia: {
                address: "0x789d6e7f86641829636605d8f64483d735165d70", // cUSDC
                decimals: 6,
                symbol: "cUSDC",
            },
            solanaDevnet: {
                // Placeholder - will be set after Solana program deployment
                mint: "11111111111111111111111111111111",
                decimals: 6,
                symbol: "cUSDC-SOL",
            },
        },
        ETH: {
            baseSepolia: {
                address: "0x525c34cb249826f74352D086d494957920B2F2E4", // cETH
                decimals: 18,
                symbol: "cETH",
            },
            solanaDevnet: {
                mint: "11111111111111111111111111111111",
                decimals: 9,
                symbol: "wETH-SOL",
            },
        },
    },

    // Bridge Configuration
    bridge: {
        // Relay Protocol API (mock for now)
        relayApi: "https://api.testnet.relay.link",
        // Inco Co-validator for Solana
        incoSolanaEndpoint: "https://grpc.solana-devnet.alpha.devnet.inco.org",
        // Inco public key for encryption
        serverPublicKey:
            "0486ca2bbf34bea44c6043f23ebc5b67ca7ccefc3710498385ecc161460a1f8729db2a361cb0d7f40847a99a75572bc10e36a365218f4bae450dc61348330bb717",
    },

    // Inco Lightning Program ID on Solana Devnet
    incoLightningProgramId: "5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj",
};

export type ChainType = "base-sepolia" | "solana-devnet";
export type TokenSymbol = "USDC" | "ETH";
