// Contract addresses on Base Sepolia
export const CONTRACTS = {
    MOCK_USDC: "0x27017A64Ba67ae473981AA498691A76478DaB16b",
    CONFIDENTIAL_ETH: "0xbEa755785ECF89a51fdc9b0136c5ECb9DB6b82Ef",
    CONFIDENTIAL_USDC: "0x7cBe942C48d9e9849b6599c19D27822b7f9f6868",
    CONFIDENTIAL_SWAP: "0xA2B9076c699f9bb06DB767d2684a2D8AEf8aD893",
} as const;

// ABIs (minimal for interaction)
export const CONFIDENTIAL_ETH_ABI = [
    {
        inputs: [],
        name: "wrap",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        name: "approve",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ name: "amount", type: "uint256" }],
        name: "unwrap",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ name: "wallet", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "bytes32" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [
            { name: "to", type: "address" },
            { name: "encryptedAmount", type: "bytes" },
        ],
        name: "transfer",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "payable",
        type: "function",
    },
] as const;

export const CONFIDENTIAL_USDC_ABI = [
    {
        inputs: [{ name: "amount", type: "uint256" }],
        name: "wrap",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        name: "approve",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ name: "amount", type: "uint256" }],
        name: "unwrap",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ name: "wallet", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "bytes32" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [
            { name: "to", type: "address" },
            { name: "encryptedAmount", type: "bytes" },
        ],
        name: "transfer",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "payable",
        type: "function",
    },
] as const;

export const MOCK_USDC_ABI = [
    {
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        name: "approve",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "decimals",
        outputs: [{ name: "", type: "uint8" }],
        stateMutability: "view",
        type: "function",
    },
] as const;

export const CONFIDENTIAL_SWAP_ABI = [
    {
        inputs: [{ name: "encryptedAmountIn", type: "bytes" }],
        name: "swapAforB",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [{ name: "encryptedAmountIn", type: "bytes" }],
        name: "swapBforA",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
] as const;

// V2 Contract with Chainlink Price Oracle
// Deploy with: npx hardhat ignition deploy ./ignition/modules/ConfidentialSwapV2.ts --network baseSepolia
export const CONFIDENTIAL_SWAP_V2_ADDRESS = "0xA2B9076c699f9bb06DB767d2684a2D8AEf8aD893";

export const CONFIDENTIAL_SWAP_V2_ABI = [
    {
        inputs: [{ name: "encryptedAmountIn", type: "bytes" }],
        name: "swapUsdcForEth",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [{ name: "encryptedAmountIn", type: "bytes" }],
        name: "swapEthForUsdc",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [{ name: "usdcAmount", type: "uint256" }],
        name: "getQuoteUsdcToEth",
        outputs: [{ name: "ethAmount", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ name: "ethAmount", type: "uint256" }],
        name: "getQuoteEthToUsdc",
        outputs: [{ name: "usdcAmount", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "getEthUsdPrice",
        outputs: [{ name: "price", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [
            { name: "amountUsdc", type: "bytes" },
            { name: "amountEth", type: "bytes" },
        ],
        name: "addLiquidity",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
] as const;
