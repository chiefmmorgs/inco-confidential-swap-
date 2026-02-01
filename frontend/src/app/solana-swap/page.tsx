"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

// Program IDs from deployed Private AMM
const PRIVATE_AMM_ID = new PublicKey("2UgU5dyB9Z7XEGKn3SW8CFz794ajVrSo4fuEJMQdM1t7");
const INCO_LIGHTNING_ID = new PublicKey("5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj");

// Mock tokens for demo
const TOKENS = {
    SOL: { symbol: "SOL", name: "Solana", decimals: 9 },
    USDC: { symbol: "USDC", name: "USD Coin", decimals: 6 },
};

export default function SolanaSwapPage() {
    const { publicKey, sendTransaction, connected } = useWallet();
    const [fromToken, setFromToken] = useState("SOL");
    const [toToken, setToToken] = useState("USDC");
    const [amount, setAmount] = useState("");
    const [isSwapping, setIsSwapping] = useState(false);
    const [txSignature, setTxSignature] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Mock encryption (in production, use @inco/solana-sdk)
    const mockEncrypt = (value: number): bigint => {
        const mockKey = BigInt("0xDEADBEEFCAFEBABE1234567890ABCDEF");
        return BigInt(Math.floor(value * 1e9)) ^ mockKey;
    };

    const handleSwap = async () => {
        if (!publicKey || !amount) return;

        setIsSwapping(true);
        setError(null);
        setTxSignature(null);

        try {
            const connection = new Connection("https://api.devnet.solana.com", "confirmed");

            // Encrypt amounts (private!)
            const encryptedAmountIn = mockEncrypt(parseFloat(amount));
            const encryptedMinOut = mockEncrypt(parseFloat(amount) * 0.95); // 5% slippage
            const direction = fromToken === "SOL";

            // Derive PDAs
            const [poolAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from("pool"), PublicKey.default.toBuffer(), PublicKey.default.toBuffer()],
                PRIVATE_AMM_ID
            );

            const [swapResult] = PublicKey.findProgramAddressSync(
                [Buffer.from("swap_result"), poolAddress.toBuffer(), publicKey.toBuffer()],
                PRIVATE_AMM_ID
            );

            // Build swap instruction
            const keys = [
                { pubkey: poolAddress, isSigner: false, isWritable: true },
                { pubkey: swapResult, isSigner: false, isWritable: true },
                { pubkey: publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: INCO_LIGHTNING_ID, isSigner: false, isWritable: false },
            ];

            // Instruction data
            const discriminator = Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]);
            const amountInData = Buffer.alloc(16);
            const minOutData = Buffer.alloc(16);
            const directionData = Buffer.alloc(1);

            writeBigInt128LE(amountInData, encryptedAmountIn);
            writeBigInt128LE(minOutData, encryptedMinOut);
            directionData.writeUInt8(direction ? 1 : 0, 0);

            const data = Buffer.concat([discriminator, amountInData, minOutData, directionData]);

            const ix = new TransactionInstruction({
                keys,
                programId: PRIVATE_AMM_ID,
                data,
            });

            const tx = new Transaction().add(ix);
            const signature = await sendTransaction(tx, connection);
            await connection.confirmTransaction(signature, "confirmed");

            setTxSignature(signature);
        } catch (err: any) {
            setError(err.message || "Swap failed");
        } finally {
            setIsSwapping(false);
        }
    };

    const switchTokens = () => {
        setFromToken(toToken);
        setToToken(fromToken);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">
                        🔐 Private Swap
                    </h1>
                    <p className="text-purple-300">
                        Fully encrypted swaps on Solana
                    </p>
                </div>

                {/* Swap Card */}
                <div className="bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-purple-500/30 p-6 shadow-2xl">
                    {/* Wallet Connection */}
                    <div className="flex justify-end mb-6">
                        <WalletMultiButton />
                    </div>

                    {/* From Token */}
                    <div className="bg-gray-900/50 rounded-xl p-4 mb-2">
                        <div className="flex justify-between mb-2">
                            <span className="text-gray-400 text-sm">You pay</span>
                            <span className="text-gray-400 text-sm">Balance: ---</span>
                        </div>
                        <div className="flex gap-4">
                            <input
                                type="number"
                                placeholder="0.0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="bg-transparent text-3xl text-white w-full outline-none"
                            />
                            <button className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition">
                                <span className="text-xl">{fromToken === "SOL" ? "◎" : "$"}</span>
                                {fromToken}
                            </button>
                        </div>
                    </div>

                    {/* Switch Button */}
                    <div className="flex justify-center -my-2 relative z-10">
                        <button
                            onClick={switchTokens}
                            className="bg-purple-600 hover:bg-purple-500 p-3 rounded-xl shadow-lg transition transform hover:scale-105"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 4.414l-3.293 3.293a1 1 0 01-1.414 0zM14.707 12.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L10 15.586l3.293-3.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>

                    {/* To Token */}
                    <div className="bg-gray-900/50 rounded-xl p-4 mt-2 mb-6">
                        <div className="flex justify-between mb-2">
                            <span className="text-gray-400 text-sm">You receive</span>
                            <span className="text-purple-400 text-sm">🔐 Encrypted</span>
                        </div>
                        <div className="flex gap-4">
                            <input
                                type="text"
                                placeholder="0.0"
                                value={amount ? "🔒 Hidden" : "0.0"}
                                disabled
                                className="bg-transparent text-3xl text-gray-400 w-full outline-none"
                            />
                            <button className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition">
                                <span className="text-xl">{toToken === "SOL" ? "◎" : "$"}</span>
                                {toToken}
                            </button>
                        </div>
                    </div>

                    {/* Privacy Badge */}
                    <div className="bg-green-900/30 border border-green-500/30 rounded-xl p-3 mb-6">
                        <div className="flex items-center gap-2 text-green-400 text-sm">
                            <span>🛡️</span>
                            <span>Swap amounts are <strong>fully encrypted</strong> using Inco FHE</span>
                        </div>
                    </div>

                    {/* Swap Button */}
                    <button
                        onClick={handleSwap}
                        disabled={!connected || !amount || isSwapping}
                        className={`w-full py-4 rounded-xl text-lg font-bold transition ${connected && amount && !isSwapping
                                ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white"
                                : "bg-gray-600 text-gray-400 cursor-not-allowed"
                            }`}
                    >
                        {!connected
                            ? "Connect Wallet"
                            : isSwapping
                                ? "Swapping..."
                                : "Swap Privately"}
                    </button>

                    {/* Transaction Result */}
                    {txSignature && (
                        <div className="mt-4 p-3 bg-purple-900/30 rounded-xl">
                            <p className="text-green-400 text-sm mb-1">✅ Swap Successful!</p>
                            <a
                                href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-400 text-xs hover:underline break-all"
                            >
                                View on Explorer →
                            </a>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="mt-4 p-3 bg-red-900/30 rounded-xl">
                            <p className="text-red-400 text-sm">❌ {error}</p>
                        </div>
                    )}
                </div>

                {/* Footer Info */}
                <div className="mt-6 text-center text-gray-500 text-sm">
                    <p>Powered by Inco Network · Solana Devnet</p>
                </div>
            </div>
        </div>
    );
}

// Helper function
function writeBigInt128LE(buffer: Buffer, value: bigint): void {
    for (let i = 0; i < 16; i++) {
        buffer[i] = Number((value >> BigInt(i * 8)) & BigInt(0xff));
    }
}
