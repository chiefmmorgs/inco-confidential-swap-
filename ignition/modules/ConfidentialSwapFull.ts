// Hardhat Ignition deployment module for full swap system with wrappers
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ConfidentialSwapFullModule = buildModule("ConfidentialSwapFullModule", (m) => {
    // 1. Deploy MockUSDC (test token)
    const mockUSDC = m.contract("MockUSDC");

    // 2. Deploy cETH wrapper (for native ETH)
    const cETH = m.contract("ConfidentialETH");

    // 3. Deploy cUSDC wrapper (wraps MockUSDC)
    const cUSDC = m.contract("ConfidentialUSDC", [mockUSDC]);

    // 4. Deploy swap contract
    const swap = m.contract("ConfidentialSwap", [cUSDC, cETH]);

    return { mockUSDC, cETH, cUSDC, swap };
});

export default ConfidentialSwapFullModule;
