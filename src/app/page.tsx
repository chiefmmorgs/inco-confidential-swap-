"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect, useBalance, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseEther, parseUnits, formatEther, formatUnits } from "viem";
import { baseSepolia } from "wagmi/chains";
import {
  CONTRACTS,
  CONFIDENTIAL_ETH_ABI,
  CONFIDENTIAL_USDC_ABI,
  MOCK_USDC_ABI,
  CONFIDENTIAL_SWAP_ABI,
  CONFIDENTIAL_SWAP_V2_ADDRESS,
  CONFIDENTIAL_SWAP_V2_ABI,
} from "@/contracts";

type TabType = "wrap" | "unwrap" | "swap" | "send";

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [activeTab, setActiveTab] = useState<TabType>("wrap");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<"ETH" | "USDC">("ETH");
  const [encryptedBytes, setEncryptedBytes] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [swapQuote, setSwapQuote] = useState<string | null>(null);

  // Decrypted balances (shown after user decrypts)
  const [decryptedCEth, setDecryptedCEth] = useState<string | null>(null);
  const [decryptedCUsdc, setDecryptedCUsdc] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Liquidity Management State
  const [liqUsdc, setLiqUsdc] = useState("");
  const [liqEth, setLiqEth] = useState("");
  const [isAddingLiq, setIsAddingLiq] = useState(false);

  // Send (Private Transfer) State
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendToken, setSendToken] = useState<"cETH" | "cUSDC">("cETH");
  const [isSending, setIsSending] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // Balances
  const { data: ethBalance } = useBalance({ address, chainId: baseSepolia.id });

  // Mock USDC balance (plaintext)
  const { data: usdcBalance } = useReadContract({
    address: CONTRACTS.MOCK_USDC,
    abi: MOCK_USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Confidential balances (encrypted handles)
  const { data: cEthHandle } = useReadContract({
    address: CONTRACTS.CONFIDENTIAL_ETH,
    abi: CONFIDENTIAL_ETH_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: cUsdcHandle } = useReadContract({
    address: CONTRACTS.CONFIDENTIAL_USDC,
    abi: CONFIDENTIAL_USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Check if balance handle is non-zero (has wrapped tokens)
  const hasCEth = cEthHandle && cEthHandle !== "0x0000000000000000000000000000000000000000000000000000000000000000";
  const hasCUsdc = cUsdcHandle && cUsdcHandle !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  // Get ETH/USD price from V2 contract (Chainlink)
  const { data: ethUsdPrice } = useReadContract({
    address: CONFIDENTIAL_SWAP_V2_ADDRESS as `0x${string}`,
    abi: CONFIDENTIAL_SWAP_V2_ABI,
    functionName: "getEthUsdPrice",
    query: {
      enabled: true,
      refetchInterval: 30000, // Refresh every 30 seconds
    },
  });

  // Calculate swap quote when amount changes
  useEffect(() => {
    if (!encryptedBytes || !ethUsdPrice) {
      setSwapQuote(null);
      return;
    }

    try {
      const inputAmount = parseFloat(encryptedBytes);
      if (isNaN(inputAmount) || inputAmount <= 0) {
        setSwapQuote(null);
        return;
      }

      const ethPrice = Number(ethUsdPrice) / 1e8; // Chainlink uses 8 decimals
      const fee = 0.997; // 0.3% fee

      if (selectedToken === "ETH") {
        // cUSDC -> cETH: divide by price
        const ethOut = (inputAmount / ethPrice) * fee;
        setSwapQuote(ethOut.toFixed(8) + " cETH");
      } else {
        // cETH -> cUSDC: multiply by price
        const usdcOut = (inputAmount * ethPrice) * fee;
        setSwapQuote(usdcOut.toFixed(2) + " cUSDC");
      }
    } catch {
      setSwapQuote(null);
    }
  }, [encryptedBytes, ethUsdPrice, selectedToken]);

  // Decrypt balance handler using Inco Lightning SDK
  const handleDecryptBalances = async () => {
    if (!window.ethereum) {
      alert("Please connect a wallet first");
      return;
    }

    setIsDecrypting(true);
    try {
      // Dynamic import of Inco SDK
      const incoJs = await import('@inco/js');
      const incoLite = await import('@inco/js/lite');
      const { createWalletClient, custom, formatEther, formatUnits } = await import('viem');

      const { supportedChains, getViemChain } = incoJs;
      const { Lightning } = incoLite;

      // Request accounts
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const account = accounts[0] as `0x${string}`;

      // Create wallet client for signing with account
      const walletClient = createWalletClient({
        account,
        chain: getViemChain(supportedChains.baseSepolia),
        transport: custom(window.ethereum)
      });

      // Initialize Lightning
      const zap = await Lightning.latest('testnet', supportedChains.baseSepolia);

      // Collect handles to decrypt
      const handles: `0x${string}`[] = [];
      if (hasCEth && cEthHandle) {
        handles.push(cEthHandle as `0x${string}`);
      }
      if (hasCUsdc && cUsdcHandle) {
        handles.push(cUsdcHandle as `0x${string}`);
      }

      if (handles.length === 0) {
        alert("No encrypted balances to decrypt");
        return;
      }

      // Request decryption (this will prompt for wallet signature)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = await (zap as any).attestedDecrypt(walletClient, handles);

      // Update decrypted values
      let idx = 0;
      if (hasCEth && cEthHandle) {
        const plaintext = results[idx].plaintext.value;
        // Format as ETH (18 decimals)
        const formatted = formatEther(BigInt(plaintext));
        setDecryptedCEth(parseFloat(formatted).toFixed(6));
        idx++;
      }
      if (hasCUsdc && cUsdcHandle) {
        const plaintext = results[idx].plaintext.value;
        // Format as USDC (6 decimals)
        const formatted = formatUnits(BigInt(plaintext), 6);
        setDecryptedCUsdc(parseFloat(formatted).toFixed(2));
      }
    } catch (error: unknown) {
      console.error("Decryption error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      alert(`Decryption failed: ${errorMessage}`);
    } finally {
      setIsDecrypting(false);
    }
  };

  // Write contract
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleWrapETH = () => {
    if (!amount) return;
    writeContract({
      address: CONTRACTS.CONFIDENTIAL_ETH,
      abi: CONFIDENTIAL_ETH_ABI,
      functionName: "wrap",
      value: parseEther(amount),
    });
  };

  const handleUnwrapETH = () => {
    if (!amount) return;

    if (selectedToken === "USDC") {
      // Unwrap cUSDC -> USDC (6 decimals)
      writeContract({
        address: CONTRACTS.CONFIDENTIAL_USDC,
        abi: CONFIDENTIAL_USDC_ABI,
        functionName: "unwrap",
        args: [parseUnits(amount, 6)],
      });
    } else {
      // Unwrap cETH -> ETH (18 decimals)
      writeContract({
        address: CONTRACTS.CONFIDENTIAL_ETH,
        abi: CONFIDENTIAL_ETH_ABI,
        functionName: "unwrap",
        args: [parseEther(amount)],
      });
    }
  };

  const handleApproveUSDC = () => {
    if (!amount) return;
    writeContract({
      address: CONTRACTS.MOCK_USDC,
      abi: MOCK_USDC_ABI,
      functionName: "approve",
      args: [CONTRACTS.CONFIDENTIAL_USDC, parseUnits(amount, 6)],
    });
  };

  const handleWrapUSDC = () => {
    if (!amount) return;
    writeContract({
      address: CONTRACTS.CONFIDENTIAL_USDC,
      abi: CONFIDENTIAL_USDC_ABI,
      functionName: "wrap",
      args: [parseUnits(amount, 6)],
    });
  };

  // Swap cUSDC -> cETH (swapAforB since tokenA = cUSDC)
  const handleSwapUsdcForEth = async () => {
    if (!encryptedBytes || !address) {
      alert("Please enter an amount to swap!");
      return;
    }

    setIsEncrypting(true);
    try {
      // Parse amount (USDC has 6 decimals)
      const amountToSwap = BigInt(Math.floor(parseFloat(encryptedBytes) * 1e6));

      // Import and initialize Inco SDK
      const incoJs = await import('@inco/js');
      const incoLite = await import('@inco/js/lite');
      const { supportedChains, handleTypes } = incoJs;
      const { Lightning } = incoLite;

      const zap = await Lightning.latest('testnet', supportedChains.baseSepolia);

      // Encrypt the amount for the V2 swap contract (must include handleType!)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encryptedAmount = await (zap as any).encrypt(amountToSwap, {
        accountAddress: address,
        dappAddress: CONFIDENTIAL_SWAP_V2_ADDRESS,
        handleType: handleTypes.euint256,
      });

      // Inco fee (increased to 0.01 ETH for safety)
      const incoFee = parseEther("0.01");

      writeContract({
        address: CONFIDENTIAL_SWAP_V2_ADDRESS as `0x${string}`,
        abi: CONFIDENTIAL_SWAP_V2_ABI,
        functionName: "swapUsdcForEth",
        args: [encryptedAmount as `0x${string}`],
        value: incoFee,
        gas: BigInt(15000000), // Very high gas limit for FHE op
      });
    } catch (error) {
      console.error("Encryption error:", error);
      alert("Failed to encrypt amount. Please try again.");
    } finally {
      setIsEncrypting(false);
    }
  };

  // Swap cETH -> cUSDC (swapBforA since tokenB = cETH)
  const handleSwapEthForUsdc = async () => {
    if (!encryptedBytes || !address) {
      alert("Please enter an amount to swap!");
      return;
    }

    setIsEncrypting(true);
    try {
      // Parse amount (ETH has 18 decimals)
      const amountToSwap = BigInt(Math.floor(parseFloat(encryptedBytes) * 1e18));

      // Import and initialize Inco SDK
      const incoJs = await import('@inco/js');
      const incoLite = await import('@inco/js/lite');
      const { supportedChains, handleTypes } = incoJs;
      const { Lightning } = incoLite;

      const zap = await Lightning.latest('testnet', supportedChains.baseSepolia);

      // Encrypt the amount for the V2 swap contract (must include handleType!)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encryptedAmount = await (zap as any).encrypt(amountToSwap, {
        accountAddress: address,
        dappAddress: CONFIDENTIAL_SWAP_V2_ADDRESS,
        handleType: handleTypes.euint256,
      });

      // Inco fee (increased to 0.01 ETH for safety)
      const incoFee = parseEther("0.01");

      writeContract({
        address: CONFIDENTIAL_SWAP_V2_ADDRESS as `0x${string}`,
        abi: CONFIDENTIAL_SWAP_V2_ABI,
        functionName: "swapEthForUsdc",
        args: [encryptedAmount as `0x${string}`],
        value: incoFee,
        gas: BigInt(15000000), // Very high gas limit for FHE op
      });
    } catch (error) {
      console.error("Encryption error:", error);
      alert("Failed to encrypt amount. Please try again.");
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleApprove = async (tokenAddress: `0x${string}`, tokenSymbol: string) => {
    console.log(`Approving ${tokenSymbol} at ${tokenAddress}...`);
    if (!address) return;
    setIsApproving(true);
    try {
      // ConfidentialERC20 requires encrypted approval amount!
      // We encrypt a large amount (effectively max approval)
      const incoJs = await import('@inco/js');
      const incoLite = await import('@inco/js/lite');
      const { supportedChains, handleTypes } = incoJs;
      const { Lightning } = incoLite;
      const zap = await Lightning.latest('testnet', supportedChains.baseSepolia);

      // Approve a very large amount (pseudo-infinite)
      const largeAmount = BigInt("1000000000000000000000000000"); // 1e27

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encryptedAmount = await (zap as any).encrypt(largeAmount, {
        accountAddress: address,
        dappAddress: tokenAddress, // Token is the dApp for approval
        handleType: handleTypes.euint256,
      });

      // DEBUG: Log the encrypted value to see what format it is
      console.log("=== ENCRYPTION DEBUG ===");
      console.log("User address:", address);
      console.log("Token (dApp) address:", tokenAddress);
      console.log("Amount to encrypt:", largeAmount.toString());
      console.log("Encrypted result type:", typeof encryptedAmount);
      console.log("Encrypted result:", encryptedAmount);
      console.log("Is it a hex string?:", typeof encryptedAmount === 'string' && encryptedAmount.startsWith('0x'));
      console.log("Length:", encryptedAmount?.length || 'N/A');
      console.log("========================");

      // Inco fee (increased for safety)
      const incoFee = parseEther("0.05");

      writeContract({
        address: tokenAddress,
        abi: [
          {
            inputs: [
              { name: "spender", type: "address" },
              { name: "encryptedAmount", type: "bytes" },
            ],
            name: "approve",
            outputs: [{ name: "", type: "bool" }],
            stateMutability: "payable",
            type: "function",
          },
        ],
        functionName: "approve",
        args: [CONFIDENTIAL_SWAP_V2_ADDRESS as `0x${string}`, encryptedAmount as `0x${string}`],
        value: incoFee,
        gas: BigInt(15000000), // Very high gas limit for FHE
      });

    } catch (error) {
      console.error("Approval error:", error);
      alert(`Failed to approve ${tokenSymbol}`);
    } finally {
      setIsApproving(false);
    }
  };

  const handleAddLiquidity = async () => {
    if (!address || !liqUsdc || !liqEth) return;
    setIsAddingLiq(true);

    try {
      const incoJs = await import('@inco/js');
      const incoLite = await import('@inco/js/lite');
      const { supportedChains, handleTypes } = incoJs;
      const { Lightning } = incoLite;
      const zap = await Lightning.latest('testnet', supportedChains.baseSepolia);

      // Encrypt USDC amount (6 decimals)
      const usdcBig = BigInt(Math.floor(parseFloat(liqUsdc) * 1e6));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encUsdc = await (zap as any).encrypt(usdcBig, {
        accountAddress: address,
        dappAddress: CONFIDENTIAL_SWAP_V2_ADDRESS,
        handleType: handleTypes.euint256,
      });

      // Encrypt ETH amount (18 decimals)
      const ethBig = BigInt(Math.floor(parseFloat(liqEth) * 1e18));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encEth = await (zap as any).encrypt(ethBig, {
        accountAddress: address,
        dappAddress: CONFIDENTIAL_SWAP_V2_ADDRESS,
        handleType: handleTypes.euint256,
      });

      // Call addLiquidity
      writeContract({
        address: CONFIDENTIAL_SWAP_V2_ADDRESS as `0x${string}`,
        abi: CONFIDENTIAL_SWAP_V2_ABI,
        functionName: "addLiquidity",
        args: [encUsdc as `0x${string}`, encEth as `0x${string}`],
        value: parseEther("0.1"), // 2 inputs fee + buffer
        gas: BigInt(15000000),
      });

    } catch (error) {
      console.error("Add Liquidity error:", error);
      alert("Failed to add liquidity");
    } finally {
      setIsAddingLiq(false);
    }
  };

  const handleTransfer = async () => {
    if (!address || !sendRecipient || !sendAmount) return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(sendRecipient)) {
      alert("Invalid recipient address format");
      return;
    }
    setIsSending(true);

    try {
      const incoJs = await import('@inco/js');
      const incoLite = await import('@inco/js/lite');
      const { supportedChains, handleTypes } = incoJs;
      const { Lightning } = incoLite;
      const zap = await Lightning.latest('testnet', supportedChains.baseSepolia);

      // Determine decimals and contract address
      const isCETH = sendToken === "cETH";
      const decimals = isCETH ? 18 : 6;
      const tokenAddress = isCETH ? CONTRACTS.CONFIDENTIAL_ETH : CONTRACTS.CONFIDENTIAL_USDC;

      // Encrypt the amount
      const amountBig = BigInt(Math.floor(parseFloat(sendAmount) * Math.pow(10, decimals)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encryptedAmount = await (zap as any).encrypt(amountBig, {
        accountAddress: address,
        dappAddress: tokenAddress,
        handleType: handleTypes.euint256,
      });

      console.log("Sending", sendAmount, sendToken, "to", sendRecipient);
      console.log("Encrypted:", encryptedAmount);

      // Call transfer(address, bytes)
      writeContract({
        address: tokenAddress,
        abi: isCETH ? CONFIDENTIAL_ETH_ABI : CONFIDENTIAL_USDC_ABI,
        functionName: "transfer",
        args: [sendRecipient as `0x${string}`, encryptedAmount as `0x${string}`],
        value: parseEther("0.01"), // Inco fee
        gas: BigInt(5000000),
      });

    } catch (error) {
      console.error("Transfer error:", error);
      alert("Failed to send tokens");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden text-sm">
      {/* Scanline overlay is in globals.css */}
      <div className="scanlines"></div>

      {/* Header */}
      <header className="border-b-4 border-white/10 bg-[#050510] relative z-10">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[var(--neon-blue)] animate-pulse"></div>
            <h1 className="text-xl md:text-2xl text-[var(--neon-blue)] uppercase tracking-widest drop-shadow-[0_0_10px_rgba(0,240,255,0.5)]">
              Inco Swap
            </h1>
          </div>

          {isConnected ? (
            <div className="flex items-center gap-4 border-2 border-[var(--neon-purple)] p-2 bg-black/50">
              <span className="text-[10px] text-gray-400 uppercase">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <span className="text-[10px] text-[var(--neon-purple)]">
                {ethBalance ? parseFloat(formatEther(ethBalance.value)).toFixed(4) : "0"} ETH
              </span>
              <button
                onClick={() => disconnect()}
                className="px-4 py-2 bg-red-500/20 text-red-500 text-[10px] border border-red-500 hover:bg-red-500 hover:text-black transition uppercase"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => connect({ connector: connectors[0] })}
              className="px-6 py-3 bg-[var(--neon-blue)] text-black border-b-4 border-r-4 border-[#00c0cc] hover:translate-y-1 hover:border-0 hover:mb-[4px] hover:mr-[4px] transition-all font-bold uppercase tracking-wider text-xs"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto mt-12 p-6 relative z-10 pb-24">

        {/* Info Banner */}
        <div className="mb-8 p-4 border-2 border-[var(--neon-purple)] bg-[var(--neon-purple)]/10 relative">
          <div className="absolute top-0 left-0 w-2 h-2 bg-[var(--neon-purple)]"></div>
          <div className="absolute top-0 right-0 w-2 h-2 bg-[var(--neon-purple)]"></div>
          <div className="absolute bottom-0 left-0 w-2 h-2 bg-[var(--neon-purple)]"></div>
          <div className="absolute bottom-0 right-0 w-2 h-2 bg-[var(--neon-purple)]"></div>
          <p className="text-[10px] text-[var(--neon-purple)] leading-relaxed text-center uppercase">
            ⚠️  Privacy Mode Active: Balances are encrypted
          </p>
        </div>

        {/* Balance Display */}
        {isConnected && (
          <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Plaintext Balances */}
            <div className="border-4 border-gray-700 bg-black p-4 relative">
              <h3 className="text-[10px] text-gray-500 uppercase mb-4 border-b-2 border-gray-800 pb-2 text-center">Public Wallet</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-gray-400 text-xs">ETH</span>
                  <span className="text-white text-sm">
                    {ethBalance ? parseFloat(formatEther(ethBalance.value)).toFixed(4) : "0"}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-gray-400 text-xs">USDC</span>
                  <span className="text-white text-sm">
                    {usdcBalance ? formatUnits(usdcBalance as bigint, 6) : "0"}
                  </span>
                </div>
              </div>
            </div>

            {/* Confidential Balances */}
            <div className="border-4 border-[var(--neon-blue)] bg-black p-4 relative shadow-[0_0_20px_rgba(0,240,255,0.2)]">
              <div className="flex justify-between items-center mb-4 border-b-2 border-[var(--neon-blue)] pb-2">
                <h3 className="text-[10px] text-[var(--neon-blue)] uppercase animate-pulse">Encrypted Storage</h3>
                {(hasCEth || hasCUsdc) && (
                  <button
                    onClick={handleDecryptBalances}
                    disabled={isDecrypting}
                    className="text-[8px] px-2 py-1 bg-[var(--neon-blue)]/20 text-[var(--neon-blue)] border border-[var(--neon-blue)] hover:bg-[var(--neon-blue)] hover:text-black uppercase"
                  >
                    {isDecrypting ? "..." : "DECRYPT"}
                  </button>
                )}
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-[var(--neon-blue)] text-xs">cETH</span>
                  <span className={`text-sm ${hasCEth ? "text-[var(--neon-green)]" : "text-gray-600"}`}>
                    {decryptedCEth || (hasCEth ? "*****" : "0")}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-[var(--neon-blue)] text-xs">cUSDC</span>
                  <span className={`text-sm ${hasCUsdc ? "text-[var(--neon-green)]" : "text-gray-600"}`}>
                    {decryptedCUsdc || (hasCUsdc ? "*****" : "0")}
                  </span>
                </div>
              </div>

              {/* Handles display */}
              {(hasCEth || hasCUsdc) && (
                <div className="mt-4 pt-2 border-t border-[var(--neon-blue)]/30">
                  <p className="text-[8px] text-gray-500 mb-1">HANDLES DETECTED:</p>
                  {hasCEth && <div className="h-1 w-full bg-[var(--neon-green)]/50 mb-1"></div>}
                  {hasCUsdc && <div className="h-1 w-full bg-[var(--neon-green)]/50"></div>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-8">
          {(["wrap", "unwrap", "swap", "send"] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-xs uppercase font-bold tracking-wider transition-all border-2
                ${activeTab === tab
                  ? "bg-[var(--neon-blue)] text-black border-[var(--neon-blue)] shadow-[0_0_15px_var(--neon-blue)] translate-y-[-2px]"
                  : "bg-black text-gray-500 border-gray-700 hover:border-gray-500 hover:text-white"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Main Interface Card */}
        <div className="border-4 border-white p-6 bg-[#0a0a1a] relative">
          {/* Corner Decorations */}
          <div className="absolute -top-1 -left-1 w-4 h-4 bg-white"></div>
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-white"></div>
          <div className="absolute -bottom-1 -left-1 w-4 h-4 bg-white"></div>
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white"></div>

          {activeTab === "wrap" && (
            <>
              <h2 className="text-lg text-white mb-6 uppercase text-center border-b-2 border-dashed border-gray-700 pb-4">
                Asset Encryption
              </h2>

              <div className="flex gap-4 mb-8">
                <button
                  onClick={() => setSelectedToken("ETH")}
                  className={`flex-1 py-2 border-2 text-[10px] uppercase ${selectedToken === "ETH"
                    ? "border-[var(--neon-blue)] text-[var(--neon-blue)] bg-[var(--neon-blue)]/10"
                    : "border-gray-800 text-gray-600"
                    }`}
                >
                  ETH → cETH
                </button>
                <button
                  onClick={() => setSelectedToken("USDC")}
                  className={`flex-1 py-2 border-2 text-[10px] uppercase ${selectedToken === "USDC"
                    ? "border-[var(--neon-green)] text-[var(--neon-green)] bg-[var(--neon-green)]/10"
                    : "border-gray-800 text-gray-600"
                    }`}
                >
                  USDC → cUSDC
                </button>
              </div>

              <div className="mb-8">
                <label className="text-[10px] text-gray-400 uppercase mb-2 block">Amount</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-black border-2 border-gray-600 p-4 text-[var(--neon-green)] text-xl font-mono focus:border-[var(--neon-green)] focus:outline-none focus:shadow-[0_0_10px_rgba(10,255,10,0.3)] transition-all placeholder-gray-800"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-bold uppercase">
                    {selectedToken}
                  </div>
                </div>
              </div>

              {selectedToken === "ETH" ? (
                <button
                  onClick={handleWrapETH}
                  disabled={!isConnected || isPending || isConfirming}
                  className="w-full py-4 bg-[var(--neon-blue)] text-black font-bold uppercase tracking-widest border-b-4 border-r-4 border-[#009099] active:border-0 active:translate-y-1 transition-all disabled:opacity-50 disabled:grayscale"
                >
                  {isPending || isConfirming ? "Processing..." : "ENCRYPT ASSETS"}
                </button>
              ) : (
                <div className="flex gap-4">
                  <button
                    onClick={handleApproveUSDC}
                    disabled={!isConnected || isPending}
                    className="flex-1 py-4 bg-gray-800 text-white font-bold uppercase border-b-4 border-r-4 border-gray-900 active:border-0 active:translate-y-1 transition-all disabled:opacity-50"
                  >
                    1. Approve
                  </button>
                  <button
                    onClick={handleWrapUSDC}
                    disabled={!isConnected || isPending || isConfirming}
                    className="flex-1 py-4 bg-[var(--neon-green)] text-black font-bold uppercase border-b-4 border-r-4 border-green-800 active:border-0 active:translate-y-1 transition-all disabled:opacity-50"
                  >
                    2. Encrypt
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === "unwrap" && (
            <>
              <h2 className="text-lg text-white mb-6 uppercase text-center border-b-2 border-dashed border-gray-700 pb-4">
                Asset Decryption
              </h2>

              <div className="flex gap-4 mb-8">
                <button
                  onClick={() => setSelectedToken("ETH")}
                  className={`flex-1 py-2 border-2 text-[10px] uppercase ${selectedToken === "ETH"
                    ? "border-[var(--neon-blue)] text-[var(--neon-blue)] bg-[var(--neon-blue)]/10"
                    : "border-gray-800 text-gray-600"
                    }`}
                >
                  cETH → ETH
                </button>
                <button
                  onClick={() => setSelectedToken("USDC")}
                  className={`flex-1 py-2 border-2 text-[10px] uppercase ${selectedToken === "USDC"
                    ? "border-[var(--neon-green)] text-[var(--neon-green)] bg-[var(--neon-green)]/10"
                    : "border-gray-800 text-gray-600"
                    }`}
                >
                  cUSDC → USDC
                </button>
              </div>

              <div className="mb-8">
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-black border-2 border-gray-600 p-4 text-red-500 text-xl font-mono focus:border-red-500 focus:outline-none focus:shadow-[0_0_10px_rgba(255,50,50,0.3)] transition-all placeholder-gray-800"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-bold uppercase">
                    c{selectedToken}
                  </div>
                </div>
              </div>

              <button
                onClick={handleUnwrapETH}
                disabled={!isConnected || isPending || isConfirming}
                className="w-full py-4 bg-red-500 text-black font-bold uppercase tracking-widest border-b-4 border-r-4 border-red-800 active:border-0 active:translate-y-1 transition-all disabled:opacity-50 disabled:grayscale"
              >
                {isPending || isConfirming ? "Processing..." : "DECRYPT ASSETS"}
              </button>
            </>
          )}

          {activeTab === "swap" && (
            <>
              <h2 className="text-lg text-white mb-6 uppercase text-center border-b-2 border-dashed border-gray-700 pb-4">
                Inco DEX
              </h2>

              <div className="flex gap-4 mb-8">
                <button
                  onClick={() => setSelectedToken("ETH")}
                  className={`flex-1 py-2 border-2 text-[10px] uppercase ${selectedToken === "ETH"
                    ? "border-[var(--neon-blue)] text-[var(--neon-blue)]"
                    : "border-gray-800 text-gray-600"
                    }`}
                >
                  cUSDC → cETH
                </button>
                <button
                  onClick={() => setSelectedToken("USDC")}
                  className={`flex-1 py-2 border-2 text-[10px] uppercase ${selectedToken === "USDC"
                    ? "border-[var(--neon-blue)] text-[var(--neon-blue)]"
                    : "border-gray-800 text-gray-600"
                    }`}
                >
                  cETH → cUSDC
                </button>
              </div>

              <div className="mb-6">
                <label className="text-[10px] text-gray-400 uppercase mb-2 block">Amount to Swap</label>
                <div className="relative">
                  <input
                    type="number"
                    value={encryptedBytes}
                    onChange={(e) => setEncryptedBytes(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-black border-2 border-[var(--neon-purple)] p-4 text-[var(--neon-purple)] text-xl font-mono focus:outline-none focus:shadow-[0_0_15px_var(--neon-purple)] transition-all placeholder-gray-800"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-bold uppercase">
                    {selectedToken === "ETH" ? "cUSDC" : "cETH"}
                  </div>
                </div>
              </div>

              {swapQuote && (
                <div className="mb-6 p-4 bg-black border-2 border-[var(--neon-green)] border-dashed">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-[10px] uppercase mb-1">Estimated Output</span>
                    <span className="text-[var(--neon-green)] font-bold text-lg animate-pulse">{swapQuote}</span>
                  </div>
                  {ethUsdPrice && (
                    <div className="text-right">
                      <span className="text-gray-600 text-[8px] uppercase">Oracle Feed: ${(Number(ethUsdPrice) / 1e8).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="mb-6 border border-white/10 p-2 bg-black/30">
                <div className="flex justify-between text-[10px] uppercase tracking-wider">
                  <span className="text-gray-500">Inco Network Fee</span>
                  <span className="text-[var(--neon-blue)]">~0.002 ETH</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    const token = selectedToken === "ETH" ? CONTRACTS.CONFIDENTIAL_USDC : CONTRACTS.CONFIDENTIAL_ETH;
                    const symbol = selectedToken === "ETH" ? "cUSDC" : "cETH";
                    handleApprove(token as `0x${string}`, symbol);
                  }}
                  disabled={isApproving || !isConnected}
                  className="w-full py-4 bg-gray-800 text-white font-bold uppercase border-b-4 border-r-4 border-gray-900 active:border-0 active:translate-y-1 transition-all disabled:opacity-50 text-[10px]"
                >
                  {isApproving ? "..." : "1. APPROVE"}
                </button>

                <button
                  onClick={selectedToken === "ETH" ? handleSwapUsdcForEth : handleSwapEthForUsdc}
                  disabled={isEncrypting || !isConnected || !encryptedBytes}
                  className="w-full py-4 bg-[var(--neon-purple)] text-white font-bold uppercase border-b-4 border-r-4 border-purple-900 active:border-0 active:translate-y-1 transition-all disabled:opacity-50 shadow-[0_0_10px_var(--neon-purple)] text-[10px]"
                >
                  {isEncrypting ? "ENCRYPTING..." : "2. EXECUTE SWAP"}
                </button>
              </div>
            </>
          )}

          {activeTab === "send" && (
            <>
              <h2 className="text-lg text-white mb-6 uppercase text-center border-b-2 border-dashed border-gray-700 pb-4">
                Shadow Transfer
              </h2>

              <div className="flex gap-4 mb-6">
                <button
                  onClick={() => setSendToken("cETH")}
                  className={`flex-1 py-2 border-2 text-[10px] uppercase ${sendToken === "cETH"
                    ? "border-[var(--neon-blue)] text-[var(--neon-blue)] bg-[var(--neon-blue)]/10"
                    : "border-gray-800 text-gray-600"
                    }`}
                >
                  cETH
                </button>
                <button
                  onClick={() => setSendToken("cUSDC")}
                  className={`flex-1 py-2 border-2 text-[10px] uppercase ${sendToken === "cUSDC"
                    ? "border-[var(--neon-green)] text-[var(--neon-green)] bg-[var(--neon-green)]/10"
                    : "border-gray-800 text-gray-600"
                    }`}
                >
                  cUSDC
                </button>
              </div>

              <div className="mb-4">
                <label className="text-[10px] text-gray-400 uppercase mb-2 block">Recipient</label>
                <input
                  type="text"
                  value={sendRecipient}
                  onChange={(e) => setSendRecipient(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-black border-2 border-white/20 p-3 text-white font-mono text-xs focus:border-white focus:outline-none transition-all placeholder-gray-700"
                />
              </div>

              <div className="mb-6">
                <label className="text-[10px] text-gray-400 uppercase mb-2 block">Amount</label>
                <div className="relative">
                  <input
                    type="number"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-black border-2 border-[var(--neon-blue)] p-4 text-[var(--neon-blue)] text-xl font-mono focus:outline-none focus:shadow-[0_0_15px_var(--neon-blue)] transition-all placeholder-gray-800"
                  />
                </div>
              </div>

              <button
                onClick={handleTransfer}
                disabled={isSending || !isConnected || !sendRecipient || !sendAmount}
                className="w-full py-4 bg-white text-black font-bold uppercase tracking-widest border-b-4 border-r-4 border-gray-400 active:border-0 active:translate-y-1 transition-all disabled:opacity-50"
              >
                {isSending ? "ENCRYPTING TRANSMISSION..." : "SEND CONFIDENTIAL"}
              </button>
            </>
          )}

          {/* Status messages with Retro styling */}
          {isSuccess && (
            <div className="mt-6 p-4 border-2 border-[var(--neon-green)] bg-[var(--neon-green)]/10 text-[var(--neon-green)] text-xs uppercase text-center font-bold">
              &gt;&gt; TRANSACTION CONFIRMED &lt;&lt;
            </div>
          )}
          {error && (
            <div className="mt-6 p-4 border-2 border-red-500 bg-red-500/10 text-red-500 text-xs uppercase text-center font-bold">
              !! ERROR: {error.message} !!
            </div>
          )}
        </div>

        {/* Contract Addresses Footer */}
        <div className="mt-8 border-t-2 border-gray-800 pt-6">
          <h3 className="text-[10px] text-gray-600 uppercase mb-4 text-center">System Contracts</h3>
          <div className="grid grid-cols-1 gap-2 text-[8px] font-mono text-gray-700 text-center">
            <p>cETH: {CONTRACTS.CONFIDENTIAL_ETH}</p>
            <p>cUSDC: {CONTRACTS.CONFIDENTIAL_USDC}</p>
            <p>SWAP: {CONTRACTS.CONFIDENTIAL_SWAP}</p>
          </div>
        </div>
      </div>

      {/* Liquidity Management Section (Bottom) */}
      <div className="border-t-4 border-white/10 bg-black/50 backdrop-blur-sm relative z-10">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="border-2 border-gray-800 p-6 bg-[#050510]">
            <h2 className="text-lg text-gray-400 mb-6 uppercase border-b border-gray-800 pb-2">Liquidity Pool Control</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="text-[10px] text-gray-500 uppercase mb-2 block">cUSDC Reserve</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={liqUsdc}
                    onChange={(e) => setLiqUsdc(e.target.value)}
                    className="flex-1 bg-black border border-gray-700 p-2 text-white text-sm focus:border-[var(--neon-blue)] focus:outline-none"
                    placeholder="Amount"
                  />
                  <button
                    onClick={() => handleApprove(CONTRACTS.CONFIDENTIAL_USDC as `0x${string}`, "cUSDC")}
                    className="px-4 bg-gray-800 text-[10px] text-gray-400 uppercase hover:bg-gray-700"
                  >
                    Auth
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase mb-2 block">cETH Reserve</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={liqEth}
                    onChange={(e) => setLiqEth(e.target.value)}
                    className="flex-1 bg-black border border-gray-700 p-2 text-white text-sm focus:border-[var(--neon-blue)] focus:outline-none"
                    placeholder="Amount"
                  />
                  <button
                    onClick={() => handleApprove(CONTRACTS.CONFIDENTIAL_ETH as `0x${string}`, "cETH")}
                    className="px-4 bg-gray-800 text-[10px] text-gray-400 uppercase hover:bg-gray-700"
                  >
                    Auth
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleAddLiquidity}
              disabled={isAddingLiq || !isConnected}
              className="mt-6 w-full py-3 border-2 border-dashed border-gray-700 text-gray-500 text-xs uppercase hover:border-[var(--neon-blue)] hover:text-[var(--neon-blue)] transition-all"
            >
              {isAddingLiq ? "INITIALIZING..." : "INJECT LIQUIDITY"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );

}
