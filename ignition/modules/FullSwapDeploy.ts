import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Base Sepolia Chainlink ETH/USD Price Feed
const CHAINLINK_ETH_USD_BASE_SEPOLIA = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1";

// Mock USDC address (already deployed for wrapping)
const MOCK_USDC_ADDRESS = "0x27017A64Ba67ae473981AA498691A76478DaB16b";

const FullSwapDeployModule = buildModule("FullSwapDeployModule", (m) => {
    // 1. Deploy ConfidentialETH (wraps native ETH)
    const confidentialETH = m.contract("ConfidentialETH");

    // 2. Deploy ConfidentialUSDC (wraps Mock USDC)
    const confidentialUSDC = m.contract("ConfidentialUSDC", [MOCK_USDC_ADDRESS]);

    // 3. Deploy ConfidentialSwapV2 with tokens and price feed
    const confidentialSwapV2 = m.contract("ConfidentialSwapV2", [
        confidentialUSDC,            // cUSDC token
        confidentialETH,             // cETH token  
        CHAINLINK_ETH_USD_BASE_SEPOLIA, // Chainlink ETH/USD price feed
    ]);

    return {
        confidentialETH,
        confidentialUSDC,
        confidentialSwapV2
    };
});

export default FullSwapDeployModule;
