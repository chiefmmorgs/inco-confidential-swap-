// Hardhat Ignition deployment module for ConfidentialSwap
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ConfidentialSwapModule = buildModule("ConfidentialSwapModule", (m) => {
    // Deploy two ConfidentialERC20 tokens
    const tokenA = m.contract("ConfidentialERC20", [], { id: "TokenA" });
    const tokenB = m.contract("ConfidentialERC20", [], { id: "TokenB" });

    // Deploy swap contract with token addresses
    const swap = m.contract("ConfidentialSwap", [tokenA, tokenB]);

    return { tokenA, tokenB, swap };
});

export default ConfidentialSwapModule;
