import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Base Sepolia Chainlink ETH/USD Price Feed
const CHAINLINK_ETH_USD_BASE_SEPOLIA = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1";

// Existing deployed token addresses
const CUSDC_ADDRESS = "0x8BFd793CA3a71E4864F6e42E093c60a9b9eacC66";
const CETH_ADDRESS = "0xD75e6995d4329D2D2034D1026352f47eDdFc25aC";

const ConfidentialSwapV2Module = buildModule("ConfidentialSwapV2Module", (m) => {
    // Deploy ConfidentialSwapV2 with Chainlink price oracle
    const confidentialSwapV2 = m.contract("ConfidentialSwapV2", [
        CUSDC_ADDRESS,           // cUSDC token
        CETH_ADDRESS,            // cETH token
        CHAINLINK_ETH_USD_BASE_SEPOLIA, // Chainlink ETH/USD price feed
    ]);

    return { confidentialSwapV2 };
});

export default ConfidentialSwapV2Module;
