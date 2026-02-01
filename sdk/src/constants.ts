import { PublicKey } from "@solana/web3.js";

// Deployed Program IDs on Devnet
export const PROGRAM_IDS = {
    INCO_TOKEN: new PublicKey("h6T7wsEJWMxN2uEZUc4SipEd8Zmz2DWasCDopindjC5"),
    PRIVATE_AMM: new PublicKey("2UgU5dyB9Z7XEGKn3SW8CFz794ajVrSo4fuEJMQdM1t7"),
    INCO_LIGHTNING: new PublicKey("5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj"),
};

// RPC Endpoints
export const RPC_ENDPOINTS = {
    DEVNET: "https://api.devnet.solana.com",
    MAINNET: "https://api.mainnet-beta.solana.com",
};

// PDA Seeds
export const SEEDS = {
    POOL: Buffer.from("pool"),
    POSITION: Buffer.from("position"),
    SWAP_RESULT: Buffer.from("swap_result"),
};
