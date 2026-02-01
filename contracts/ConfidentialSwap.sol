// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { e, ebool, euint256, inco } from "@inco/lightning/src/Lib.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IConfidentialToken {
    function balanceOf(address wallet) external view returns (euint256);
}

/**
 * @title ConfidentialSwap
 * @notice Privacy-preserving AMM using Inco FHE
 * @dev Swaps between cUSDC and cETH with encrypted reserves
 */
contract ConfidentialSwap is Ownable2Step {
    error InsufficientFees();
    error InsufficientLiquidity();

    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB);
    event Swap(address indexed user, address indexed tokenIn);

    IConfidentialToken public tokenA; // cUSDC
    IConfidentialToken public tokenB; // cETH

    // Encrypted reserves
    euint256 public reserveA;
    euint256 public reserveB;

    // Fee: 0.3% = 997/1000
    uint256 public constant FEE_FACTOR = 997;
    uint256 public constant FEE_DENOM = 1000;

    constructor(address _tokenA, address _tokenB) Ownable(msg.sender) {
        tokenA = IConfidentialToken(_tokenA);
        tokenB = IConfidentialToken(_tokenB);
        
        // Initialize reserves to zero
        reserveA = e.asEuint256(0);
        reserveB = e.asEuint256(0);
        e.allow(reserveA, address(this));
        e.allow(reserveB, address(this));
    }

    /**
     * @notice Add liquidity to the pool (plaintext amounts for simplicity)
     */
    function addLiquidity(uint256 amountA, uint256 amountB) external onlyOwner {
        reserveA = e.add(reserveA, e.asEuint256(amountA));
        reserveB = e.add(reserveB, e.asEuint256(amountB));
        
        e.allow(reserveA, address(this));
        e.allow(reserveB, address(this));
        
        emit LiquidityAdded(msg.sender, amountA, amountB);
    }

    /**
     * @notice Swap cUSDC for cETH with encrypted amount
     * @param encryptedAmountIn Encrypted input amount
     */
    function swapAforB(bytes calldata encryptedAmountIn) external payable {
        _requireFee(1);
        euint256 amountIn = e.newEuint256(encryptedAmountIn, msg.sender);
        e.allow(amountIn, address(this));

        // Check user balance
        euint256 userBalance = tokenA.balanceOf(msg.sender);
        ebool hasBalance = e.ge(userBalance, amountIn);

        // Calculate output: amountOut = (reserveB * amountIn * 997) / (reserveA * 1000 + amountIn * 997)
        euint256 amountInWithFee = e.mul(amountIn, e.asEuint256(FEE_FACTOR));
        euint256 numerator = e.mul(reserveB, amountInWithFee);
        euint256 denominator = e.add(
            e.mul(reserveA, e.asEuint256(FEE_DENOM)),
            amountInWithFee
        );
        euint256 amountOut = e.div(numerator, denominator);

        // Check liquidity
        ebool hasLiquidity = e.ge(reserveB, amountOut);
        ebool canSwap = e.and(hasBalance, hasLiquidity);

        // Update reserves conditionally
        euint256 actualAmountIn = e.select(canSwap, amountIn, e.asEuint256(0));
        euint256 actualAmountOut = e.select(canSwap, amountOut, e.asEuint256(0));

        reserveA = e.add(reserveA, actualAmountIn);
        reserveB = e.sub(reserveB, actualAmountOut);

        e.allow(reserveA, address(this));
        e.allow(reserveB, address(this));
        e.allow(actualAmountOut, msg.sender);

        emit Swap(msg.sender, address(tokenA));
    }

    /**
     * @notice Swap cETH for cUSDC with encrypted amount
     */
    function swapBforA(bytes calldata encryptedAmountIn) external payable {
        _requireFee(1);
        euint256 amountIn = e.newEuint256(encryptedAmountIn, msg.sender);
        e.allow(amountIn, address(this));

        euint256 userBalance = tokenB.balanceOf(msg.sender);
        ebool hasBalance = e.ge(userBalance, amountIn);

        euint256 amountInWithFee = e.mul(amountIn, e.asEuint256(FEE_FACTOR));
        euint256 numerator = e.mul(reserveA, amountInWithFee);
        euint256 denominator = e.add(
            e.mul(reserveB, e.asEuint256(FEE_DENOM)),
            amountInWithFee
        );
        euint256 amountOut = e.div(numerator, denominator);

        ebool hasLiquidity = e.ge(reserveA, amountOut);
        ebool canSwap = e.and(hasBalance, hasLiquidity);

        euint256 actualAmountIn = e.select(canSwap, amountIn, e.asEuint256(0));
        euint256 actualAmountOut = e.select(canSwap, amountOut, e.asEuint256(0));

        reserveB = e.add(reserveB, actualAmountIn);
        reserveA = e.sub(reserveA, actualAmountOut);

        e.allow(reserveA, address(this));
        e.allow(reserveB, address(this));
        e.allow(actualAmountOut, msg.sender);

        emit Swap(msg.sender, address(tokenB));
    }

    function _requireFee(uint256 cipherTextCount) internal view {
        if (msg.value < inco.getFee() * cipherTextCount) revert InsufficientFees();
    }
}
