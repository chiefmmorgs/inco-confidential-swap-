"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEEDS = exports.RPC_ENDPOINTS = exports.PROGRAM_IDS = void 0;
const web3_js_1 = require("@solana/web3.js");
// Deployed Program IDs on Devnet
exports.PROGRAM_IDS = {
    INCO_TOKEN: new web3_js_1.PublicKey("h6T7wsEJWMxN2uEZUc4SipEd8Zmz2DWasCDopindjC5"),
    PRIVATE_AMM: new web3_js_1.PublicKey("2UgU5dyB9Z7XEGKn3SW8CFz794ajVrSo4fuEJMQdM1t7"),
    INCO_LIGHTNING: new web3_js_1.PublicKey("5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj"),
};
// RPC Endpoints
exports.RPC_ENDPOINTS = {
    DEVNET: "https://api.devnet.solana.com",
    MAINNET: "https://api.mainnet-beta.solana.com",
};
// PDA Seeds
exports.SEEDS = {
    POOL: Buffer.from("pool"),
    POSITION: Buffer.from("position"),
    SWAP_RESULT: Buffer.from("swap_result"),
};
