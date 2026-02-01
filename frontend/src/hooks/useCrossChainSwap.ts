"use client";

import { useState, useCallback } from "react";
import { useRelayBridge, BridgeQuote, BridgeStatus } from "./useRelayBridge";
import { ChainType, TokenSymbol, CROSSCHAIN_CONFIG } from "../crosschain-config";

export type SwapStatus = "idle" | "encrypting" | "wrapping" | "bridging" | "unwrapping" | "completed" | "failed";

interface CrossChainSwapResult {
    status: SwapStatus;
    sourceTxHash?: string;
    destTxHash?: string;
    error?: string;
}

export function useCrossChainSwap() {
    const { getQuote, executeBridge, trackTransaction, isLoading: isBridgeLoading } = useRelayBridge();

    const [status, setStatus] = useState<SwapStatus>("idle");
    const [isProcessing, setIsProcessing] = useState(false);

    /**
     * Encrypt amount using Inco SDK (EVM or Solana)
     */
    const encryptAmount = useCallback(async (
        amount: string,
        chain: ChainType,
        decimals: number
    ): Promise<string> => {
        if (chain === "base-sepolia") {
            // Use Inco JS SDK for EVM
            const incoJs = await import("@inco/js");
            const incoLite = await import("@inco/js/lite");
            const { supportedChains, handleTypes } = incoJs;
            const { Lightning } = incoLite;

            const zap = await Lightning.latest("testnet", supportedChains.baseSepolia);
            const amountBig = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const encrypted = await (zap as any).encrypt(amountBig, {
                handleType: handleTypes.euint256,
            });

            return encrypted as string;
        } else {
            // Use Inco Solana SDK
            const { encryptValue } = await import("@inco/solana-sdk/encryption");
            const amountBig = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));
            return await encryptValue(amountBig);
        }
    }, []);

    /**
     * Execute a cross-chain swap with optional privacy
     */
    const initiateSwap = useCallback(async (
        fromChain: ChainType,
        toChain: ChainType,
        token: TokenSymbol,
        amount: string,
        isPrivate: boolean,
        recipientAddress?: string
    ): Promise<CrossChainSwapResult> => {
        setIsProcessing(true);
        setStatus("idle");

        try {
            // 1. Get Quote
            const quote = await getQuote(fromChain, toChain, token, amount, isPrivate);
            if (!quote) {
                throw new Error("Failed to get bridge quote");
            }

            let encryptedAmount: string | undefined;

            // 2. Encrypt if private mode
            if (isPrivate) {
                setStatus("encrypting");
                const tokenConfig = CROSSCHAIN_CONFIG.tokens[token];
                const decimals = fromChain === "base-sepolia"
                    ? tokenConfig.baseSepolia.decimals
                    : tokenConfig.solanaDevnet.decimals;

                encryptedAmount = await encryptAmount(amount, fromChain, decimals);
                console.log("Encrypted:", encryptedAmount.slice(0, 30) + "...");
            }

            // 3. Execute bridge
            setStatus("bridging");
            const sourceTxHash = await executeBridge(quote, encryptedAmount);
            if (!sourceTxHash) {
                throw new Error("Bridge execution failed");
            }

            // 4. Track completion
            const bridgeStatus = await trackTransaction(sourceTxHash);

            if (bridgeStatus.status === "completed") {
                setStatus("completed");
                return {
                    status: "completed",
                    sourceTxHash,
                    destTxHash: bridgeStatus.destTxHash,
                };
            } else {
                throw new Error(bridgeStatus.error || "Bridge failed");
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            setStatus("failed");
            return {
                status: "failed",
                error: message,
            };
        } finally {
            setIsProcessing(false);
        }
    }, [getQuote, executeBridge, trackTransaction, encryptAmount]);

    return {
        initiateSwap,
        status,
        isProcessing: isProcessing || isBridgeLoading,
    };
}
