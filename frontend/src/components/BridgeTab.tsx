"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAccount } from "wagmi";
import { useCrossChainSwap, SwapStatus } from "@/hooks/useCrossChainSwap";
import { ChainType, TokenSymbol, CROSSCHAIN_CONFIG } from "@/crosschain-config";

export function BridgeTab() {
    const { address: evmAddress, isConnected: isEvmConnected } = useAccount();
    const { publicKey: solanaAddress, connected: isSolanaConnected } = useWallet();
    const { setVisible: openSolanaModal } = useWalletModal();

    const { initiateSwap, status, isProcessing } = useCrossChainSwap();

    const [direction, setDirection] = useState<"base-to-sol" | "sol-to-base">("base-to-sol");
    const [token, setToken] = useState<TokenSymbol>("USDC");
    const [amount, setAmount] = useState("");
    const [isPrivate, setIsPrivate] = useState(true);
    const [recipient, setRecipient] = useState("");
    const [txResult, setTxResult] = useState<{ sourceTxHash?: string; destTxHash?: string } | null>(null);

    const fromChain: ChainType = direction === "base-to-sol" ? "base-sepolia" : "solana-devnet";
    const toChain: ChainType = direction === "base-to-sol" ? "solana-devnet" : "base-sepolia";

    const handleBridge = async () => {
        if (!amount) return;

        const result = await initiateSwap(fromChain, toChain, token, amount, isPrivate, recipient || undefined);

        if (result.status === "completed") {
            setTxResult({
                sourceTxHash: result.sourceTxHash,
                destTxHash: result.destTxHash,
            });
            setAmount("");
        }
    };

    const getStatusText = (s: SwapStatus): string => {
        switch (s) {
            case "encrypting": return "ENCRYPTING PAYLOAD...";
            case "wrapping": return "WRAPPING TOKENS...";
            case "bridging": return "BRIDGING CROSS-CHAIN...";
            case "unwrapping": return "UNWRAPPING ON DEST...";
            case "completed": return "BRIDGE COMPLETE!";
            case "failed": return "BRIDGE FAILED";
            default: return "INITIATE BRIDGE";
        }
    };

    return (
        <>
            <h2 className="text-lg text-white mb-6 uppercase text-center border-b-2 border-dashed border-gray-700 pb-4">
                ☀️ Cross-Chain Bridge
            </h2>

            {/* Wallet Status */}
            <div className="mb-6 grid grid-cols-2 gap-4">
                <div className={`p-3 border-2 ${isEvmConnected ? "border-[var(--neon-blue)]" : "border-gray-700"} text-center`}>
                    <div className="text-[8px] text-gray-500 uppercase mb-1">Base Sepolia</div>
                    {isEvmConnected ? (
                        <div className="text-[10px] text-[var(--neon-blue)] font-mono truncate">
                            {evmAddress?.slice(0, 6)}...{evmAddress?.slice(-4)}
                        </div>
                    ) : (
                        <div className="text-[10px] text-gray-600">Not Connected</div>
                    )}
                </div>
                <div className={`p-3 border-2 ${isSolanaConnected ? "border-[var(--neon-purple)]" : "border-gray-700"} text-center`}>
                    <div className="text-[8px] text-gray-500 uppercase mb-1">Solana Devnet</div>
                    {isSolanaConnected ? (
                        <div className="text-[10px] text-[var(--neon-purple)] font-mono truncate">
                            {solanaAddress?.toBase58().slice(0, 4)}...{solanaAddress?.toBase58().slice(-4)}
                        </div>
                    ) : (
                        <button
                            onClick={() => openSolanaModal(true)}
                            className="text-[10px] text-gray-400 hover:text-[var(--neon-purple)] underline"
                        >
                            Connect Phantom
                        </button>
                    )}
                </div>
            </div>

            {/* Direction Toggle */}
            <div className="mb-6 flex gap-2">
                <button
                    onClick={() => setDirection("base-to-sol")}
                    className={`flex-1 py-2 border-2 text-[10px] uppercase transition-all ${direction === "base-to-sol"
                        ? "border-[var(--neon-blue)] text-[var(--neon-blue)] bg-[var(--neon-blue)]/10"
                        : "border-gray-700 text-gray-500"
                        }`}
                >
                    Base → Solana
                </button>
                <button
                    onClick={() => setDirection("sol-to-base")}
                    className={`flex-1 py-2 border-2 text-[10px] uppercase transition-all ${direction === "sol-to-base"
                        ? "border-[var(--neon-purple)] text-[var(--neon-purple)] bg-[var(--neon-purple)]/10"
                        : "border-gray-700 text-gray-500"
                        }`}
                >
                    Solana → Base
                </button>
            </div>

            {/* Token Selection */}
            <div className="mb-6">
                <label className="text-[10px] text-gray-400 uppercase mb-2 block">Token</label>
                <div className="flex gap-2">
                    <button
                        onClick={() => setToken("USDC")}
                        className={`flex-1 py-2 border-2 text-xs uppercase ${token === "USDC"
                            ? "border-[var(--neon-green)] text-[var(--neon-green)]"
                            : "border-gray-700 text-gray-500"
                            }`}
                    >
                        USDC
                    </button>
                    <button
                        onClick={() => setToken("ETH")}
                        disabled
                        className="flex-1 py-2 border-2 border-gray-800 text-gray-700 text-xs uppercase cursor-not-allowed"
                    >
                        ETH (Soon)
                    </button>
                </div>
            </div>

            {/* Amount Input */}
            <div className="mb-6">
                <label className="text-[10px] text-gray-400 uppercase mb-2 block">Amount</label>
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-black border-2 border-gray-600 p-4 text-[var(--neon-green)] text-xl font-mono focus:border-[var(--neon-green)] focus:outline-none"
                />
            </div>

            {/* Privacy Toggle */}
            <div className="mb-6 flex items-center justify-between p-3 border border-gray-700">
                <span className="text-[10px] text-gray-400 uppercase">Confidential Mode</span>
                <button
                    onClick={() => setIsPrivate(!isPrivate)}
                    className={`px-4 py-1 text-[10px] uppercase border ${isPrivate
                        ? "border-[var(--neon-green)] text-[var(--neon-green)] bg-[var(--neon-green)]/10"
                        : "border-gray-600 text-gray-500"
                        }`}
                >
                    {isPrivate ? "🔒 ON" : "OFF"}
                </button>
            </div>

            {/* Recipient (Optional) */}
            <div className="mb-6">
                <label className="text-[10px] text-gray-400 uppercase mb-2 block">
                    Recipient (Optional)
                </label>
                <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder={direction === "base-to-sol" ? "Solana address..." : "0x EVM address..."}
                    className="w-full bg-black border border-gray-700 p-3 text-white text-xs font-mono focus:border-gray-500 focus:outline-none"
                />
                <p className="text-[8px] text-gray-600 mt-1">Leave empty to receive on your own wallet</p>
            </div>

            {/* Bridge Button */}
            <button
                onClick={handleBridge}
                disabled={isProcessing || !amount || (!isEvmConnected && direction === "base-to-sol") || (!isSolanaConnected && direction === "sol-to-base")}
                className={`w-full py-4 font-bold uppercase tracking-widest border-b-4 border-r-4 transition-all disabled:opacity-50
                    ${direction === "base-to-sol"
                        ? "bg-[var(--neon-blue)] text-black border-[#009099]"
                        : "bg-[var(--neon-purple)] text-white border-[#8b0fd6]"
                    }
                    active:border-0 active:translate-y-1
                `}
            >
                {getStatusText(status)}
            </button>

            {/* Progress Steps */}
            {status !== "idle" && status !== "completed" && (
                <div className="mt-6 space-y-2">
                    <StepIndicator label="Encrypting" active={status === "encrypting"} done={["wrapping", "bridging", "unwrapping", "failed"].includes(status)} />
                    <StepIndicator label="Wrapping" active={status === "wrapping"} done={["bridging", "unwrapping", "failed"].includes(status)} />
                    <StepIndicator label="Bridging" active={status === "bridging"} done={["unwrapping", "failed"].includes(status)} />
                    <StepIndicator label="Unwrapping" active={status === "unwrapping"} done={false} />
                </div>
            )}

            {/* Success Message */}
            {txResult && (
                <div className="mt-6 p-4 border-2 border-[var(--neon-green)] bg-[var(--neon-green)]/10 text-[var(--neon-green)] text-xs uppercase text-center">
                    <p>&gt;&gt; BRIDGE COMPLETE &lt;&lt;</p>
                    {txResult.sourceTxHash && (
                        <a
                            href={`${CROSSCHAIN_CONFIG.chains[fromChain === "base-sepolia" ? "baseSepolia" : "solanaDevnet"].explorer}/tx/${txResult.sourceTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-[8px] block mt-2"
                        >
                            View Source TX
                        </a>
                    )}
                </div>
            )}
        </>
    );
}

function StepIndicator({ label, active, done }: { label: string; active: boolean; done: boolean }) {
    return (
        <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${done ? "bg-[var(--neon-green)]" : active ? "bg-yellow-500 animate-pulse" : "bg-gray-800"}`} />
            <span className={`text-[10px] uppercase ${done ? "text-[var(--neon-green)]" : active ? "text-yellow-500" : "text-gray-600"}`}>
                {label}
            </span>
        </div>
    );
}
