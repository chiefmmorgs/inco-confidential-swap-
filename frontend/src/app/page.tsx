"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect, useBalance, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseEther, parseUnits, formatEther, formatUnits } from "viem";
import { baseSepolia } from "wagmi/chains";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
// Inco SDK for real encryption
import { encryptValue } from "@inco/solana-sdk/encryption";
import { hexToBuffer } from "@inco/solana-sdk/utils";
import { decrypt } from "@inco/solana-sdk/attested-decrypt";
import {
  CONTRACTS,
  CONFIDENTIAL_ETH_ABI,
  CONFIDENTIAL_USDC_ABI,
  MOCK_USDC_ABI,
  CONFIDENTIAL_SWAP_ABI,
  CONFIDENTIAL_SWAP_V2_ADDRESS,
  CONFIDENTIAL_SWAP_V2_ABI,
} from "@/contracts";
import { BridgeTab } from "@/components/BridgeTab";

type TabType = "wrap" | "unwrap" | "swap" | "send" | "bridge";

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();


  // Solana wallet
  const { publicKey: solanaPublicKey, connected: solanaConnected, sendTransaction: sendSolanaTransaction, signMessage: signSolanaMessage } = useWallet();
  const [activeTab, setActiveTab] = useState<TabType>("wrap");
  const [selectedChain, setSelectedChain] = useState<"base" | "solana">("base");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<"ETH" | "USDC">("ETH");
  const [encryptedBytes, setEncryptedBytes] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [swapQuote, setSwapQuote] = useState<string | null>(null);

  // Decrypted balances (shown after user decrypts)
  const [decryptedCEth, setDecryptedCEth] = useState<string | null>(null);
  const [decryptedCUsdc, setDecryptedCUsdc] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Liquidity Management State (Base)
  const [liqUsdc, setLiqUsdc] = useState("");
  const [liqEth, setLiqEth] = useState("");
  const [isAddingLiq, setIsAddingLiq] = useState(false);

  // Solana Liquidity Management State

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

  // Solana wrap handler
  const [isSolanaWrapping, setIsSolanaWrapping] = useState(false);
  const [solanaTxSignature, setSolanaTxSignature] = useState<string | null>(null);

  // Solana balance state
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [confidentialSolBalance, setConfidentialSolBalance] = useState<string>('*****');
  const [confidentialUsdcBalance, setConfidentialUsdcBalance] = useState<string>('0');
  const [splUsdcBalance, setSplUsdcBalance] = useState<number>(0); // Real SPL USDC balance

  // Load balances when wallet connects/changes
  useEffect(() => {
    if (solanaPublicKey) {
      const savedSol = localStorage.getItem(`cSOL_balance_${solanaPublicKey.toBase58()}`);
      const savedUsdc = localStorage.getItem(`cUSDC_balance_${solanaPublicKey.toBase58()}`);

      if (savedSol) setConfidentialSolBalance(savedSol);
      else setConfidentialSolBalance('*****'); // Reset if new wallet has no history

      if (savedUsdc) setConfidentialUsdcBalance(savedUsdc);
      else setConfidentialUsdcBalance('0');
    } else {
      // Reset when disconnected
      setConfidentialSolBalance('*****');
      setConfidentialUsdcBalance('0');
    }
  }, [solanaPublicKey]);

  // Persist confidential balances to localStorage (wallet-specific)
  useEffect(() => {
    if (solanaPublicKey) {
      // Save even if empty/default to keep state consistent
      localStorage.setItem(`cSOL_balance_${solanaPublicKey.toBase58()}`, confidentialSolBalance);
    }
  }, [confidentialSolBalance, solanaPublicKey]);

  useEffect(() => {
    if (solanaPublicKey) {
      localStorage.setItem(`cUSDC_balance_${solanaPublicKey.toBase58()}`, confidentialUsdcBalance);
    }
  }, [confidentialUsdcBalance, solanaPublicKey]);

  // Deployed addresses from setup script (run: npx ts-node sdk/scripts/setup-solana.ts)
  const SOLANA_CONFIG = {
    // cSOL (9 decimals)
    solMint: new PublicKey("J7bYB7CMVKnakNZxeDY6eG7KTHVryPdHmXdR3cbWRV4F"),
    solAccount: new PublicKey("9rQzfa71BUUGGfiwjSoWLAUzgDGhJnqd1RbCFwMEdjSz"),
    // cUSDC (6 decimals)
    usdcMint: new PublicKey("G7EzuDs86oQX7ckv5AheQTBgas4UYFqD1Zorx3V3FhdK"),
    usdcAccount: new PublicKey("CY8N8fDMaB88E39m9TWMycX9LShMEV6HkSWN5NpU2SBt"),
    // SPL USDC Token (for real token transfers)
    splUsdcMint: new PublicKey("4URjKHCdGwqQVZwqLmkAc25gGLTXw7xBkoPMcPuVYJ7U"),
    usdcVault: new PublicKey("HgE9MCv5umddqVHaytfEMm4fNfquqRwW38Sa34DHgp9s"),
    // Program
    program: new PublicKey("h6T7wsEJWMxN2uEZUc4SipEd8Zmz2DWasCDopindjC5"),
  };

  // Fetch Solana balance
  useEffect(() => {
    const fetchSolBalance = async () => {
      if (!solanaPublicKey) return;
      try {
        const connection = new Connection("https://api.devnet.solana.com", "confirmed");
        const balance = await connection.getBalance(solanaPublicKey);
        setSolBalance(balance / LAMPORTS_PER_SOL);
      } catch (e) {
        console.error("Failed to fetch SOL balance:", e);
      }
    };
    fetchSolBalance();
    const interval = setInterval(fetchSolBalance, 10000);
    return () => clearInterval(interval);
  }, [solanaPublicKey]);

  // Fetch SPL USDC balance
  useEffect(() => {
    const fetchSplUsdcBalance = async () => {
      if (!solanaPublicKey) return;
      try {
        const connection = new Connection("https://api.devnet.solana.com", "confirmed");
        const userTokenAccount = await getAssociatedTokenAddress(
          SOLANA_CONFIG.splUsdcMint,
          solanaPublicKey
        );
        const accountInfo = await connection.getAccountInfo(userTokenAccount);
        if (accountInfo) {
          // Parse token account data - balance is at offset 64, 8 bytes (u64)
          const data = accountInfo.data;
          const balance = data.readBigUInt64LE(64);
          setSplUsdcBalance(Number(balance) / 1e6); // 6 decimals
        } else {
          setSplUsdcBalance(0);
        }
      } catch (e) {
        console.error("Failed to fetch SPL USDC balance:", e);
        setSplUsdcBalance(0);
      }
    };
    fetchSplUsdcBalance();
    const interval = setInterval(fetchSplUsdcBalance, 10000);
    return () => clearInterval(interval);
  }, [solanaPublicKey, solanaTxSignature]); // Refetch after transactions

  const handleSolanaWrap = async () => {
    if (!solanaPublicKey || !amount || !sendSolanaTransaction) {
      alert("Please connect your Solana wallet and enter an amount");
      return;
    }

    setIsSolanaWrapping(true);
    setSolanaTxSignature(null);

    try {
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");

      // Choose token based on selection
      const isSOL = selectedToken === "ETH"; // ETH maps to SOL on Solana
      const mint = isSOL ? SOLANA_CONFIG.solMint : SOLANA_CONFIG.usdcMint;
      const decimals = isSOL ? 9 : 6;

      // Convert amount to lamports
      const amountLamports = Math.floor(parseFloat(amount) * Math.pow(10, decimals));
      const amountValue = BigInt(amountLamports);

      // 🔐 REAL INCO ENCRYPTION - encrypt the amount using Inco SDK
      console.log("Encrypting amount with Inco SDK...", amountValue.toString());
      const encryptedHex = await encryptValue(amountValue);
      console.log("Encrypted ciphertext:", encryptedHex.slice(0, 50) + "...");

      // Convert encrypted hex to u128 for the program
      const encryptedBuffer = hexToBuffer(encryptedHex);
      // Take first 16 bytes as u128 (or hash it down)
      let encryptedU128 = BigInt(0);
      for (let i = 0; i < Math.min(16, encryptedBuffer.length); i++) {
        encryptedU128 |= BigInt(encryptedBuffer[i]) << BigInt(i * 8);
      }

      // === Derive user balance PDA ===
      const [userBalancePda, userBalanceBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_balance"), solanaPublicKey.toBuffer(), mint.toBuffer()],
        SOLANA_CONFIG.program
      );
      console.log("User Balance PDA:", userBalancePda.toBase58());

      // === Derive SOL vault PDA ===
      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("sol_vault_v2")],
        SOLANA_CONFIG.program
      );
      console.log("SOL Vault PDA:", solVaultPda.toBase58());

      // Check if SOL vault account exists
      const vaultInfo = await connection.getAccountInfo(solVaultPda);

      // Check if user balance account exists
      const userBalanceInfo = await connection.getAccountInfo(userBalancePda);

      const transaction = new Transaction();

      // If SOL vault doesn't exist, initialize it first (one-time setup)
      if (!vaultInfo) {
        console.log("Initializing SOL vault account...");
        // initialize_sol_vault discriminator from IDL
        const initVaultDiscriminator = new Uint8Array([25, 89, 248, 49, 109, 89, 34, 231]);

        const initVaultInstruction = new TransactionInstruction({
          keys: [
            { pubkey: solVaultPda, isSigner: false, isWritable: true },
            { pubkey: solanaPublicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: SOLANA_CONFIG.program,
          data: Buffer.from(initVaultDiscriminator),
        });
        transaction.add(initVaultInstruction);
      }

      // If user balance doesn't exist, initialize it first
      if (!userBalanceInfo) {
        console.log("Initializing user balance account...");
        // initialize_user_balance discriminator from IDL
        const initDiscriminator = new Uint8Array([65, 60, 31, 85, 143, 18, 45, 58]);

        const initInstruction = new TransactionInstruction({
          keys: [
            { pubkey: userBalancePda, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: solanaPublicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: SOLANA_CONFIG.program,
          data: Buffer.from(initDiscriminator),
        });
        transaction.add(initInstruction);
      }

      // === Build wrap_to_user instruction ===
      // wrap_to_user discriminator from IDL
      const wrapDiscriminator = new Uint8Array([58, 42, 235, 188, 56, 198, 78, 179]);

      // Args: amount (u64) + encrypted_amount (u128)
      const amountBytes = new Uint8Array(8);
      for (let i = 0; i < 8; i++) {
        amountBytes[i] = Number((amountValue >> BigInt(i * 8)) & BigInt(0xff));
      }

      const encryptedBytes = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        encryptedBytes[i] = Number((encryptedU128 >> BigInt(i * 8)) & BigInt(0xff));
      }

      const wrapData = Buffer.concat([
        Buffer.from(wrapDiscriminator),
        Buffer.from(amountBytes),
        Buffer.from(encryptedBytes)
      ]);

      const wrapInstruction = new TransactionInstruction({
        keys: [
          { pubkey: solVaultPda, isSigner: false, isWritable: true },
          { pubkey: userBalancePda, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: solanaPublicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: SOLANA_CONFIG.program,
        data: wrapData,
      });
      transaction.add(wrapInstruction);

      const signature = await sendSolanaTransaction(transaction, connection);
      await connection.confirmTransaction(signature, "confirmed");

      setSolanaTxSignature(signature);
      const tokenSymbol = isSOL ? "cSOL" : "cUSDC";
      const newAmount = parseFloat(amount);

      // Accumulate balances
      if (isSOL) {
        const currentBalance = parseFloat(confidentialSolBalance.replace(' cSOL', '')) || 0;
        const totalBalance = (currentBalance + newAmount).toFixed(4);
        setConfidentialSolBalance(`${totalBalance} cSOL`);
      } else {
        const currentBalance = parseFloat(confidentialUsdcBalance.replace(' cUSDC', '')) || 0;
        const totalBalance = (currentBalance + newAmount).toFixed(2);
        setConfidentialUsdcBalance(`${totalBalance} cUSDC`);
      }
      alert(`✅ Wrapped with Inco FHE!\n\nSignature: ${signature}\n\n🔐 ${amount} SOL locked in vault\n📦 ${amount} ${tokenSymbol} credited to your confidential balance\n\nYour balance PDA: ${userBalancePda.toBase58().slice(0, 8)}...`);

    } catch (error: any) {
      console.error("Solana wrap error:", error);
      alert(`Wrap failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsSolanaWrapping(false);
    }
  };

  // Solana Burn (Unwrap) handler - burns from user's PDA balance
  // cSOL → SOL: On-chain vault transfer
  // cUSDC → USDC: Simulated (demo) since we don't have SPL token vault
  const handleSolanaBurn = async () => {
    if (!solanaPublicKey || !amount || !sendSolanaTransaction) {
      alert("Please connect wallet and enter amount");
      return;
    }

    setIsSolanaWrapping(true);
    try {
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");

      const isSOL = selectedToken === "ETH";
      const mint = isSOL ? SOLANA_CONFIG.solMint : SOLANA_CONFIG.usdcMint;
      const decimals = isSOL ? 9 : 6;
      const tokenSymbol = isSOL ? "cSOL" : "cUSDC";
      const outputSymbol = isSOL ? "SOL" : "USDC";

      const amountLamports = Math.floor(parseFloat(amount) * Math.pow(10, decimals));
      const amountValue = BigInt(amountLamports);

      // Check local balance first
      const burnAmount = parseFloat(amount);
      if (isSOL) {
        const currentBalance = parseFloat(confidentialSolBalance.replace(' cSOL', '')) || 0;
        if (burnAmount > currentBalance) {
          alert(`Insufficient balance. You have ${currentBalance} cSOL`);
          setIsSolanaWrapping(false);
          return;
        }
      } else {
        const currentBalance = parseFloat(confidentialUsdcBalance.replace(' cUSDC', '')) || 0;
        if (burnAmount > currentBalance) {
          alert(`Insufficient balance. You have ${currentBalance} cUSDC`);
          setIsSolanaWrapping(false);
          return;
        }
      }

      // For USDC: Real on-chain unwrap using USDC vault
      if (!isSOL) {
        // === Derive user balance PDA for USDC ===
        const [userBalancePda] = PublicKey.findProgramAddressSync(
          [Buffer.from("user_balance"), solanaPublicKey.toBuffer(), mint.toBuffer()],
          SOLANA_CONFIG.program
        );
        console.log("User USDC Balance PDA:", userBalancePda.toBase58());

        // Check if user balance PDA exists
        const userBalanceInfo = await connection.getAccountInfo(userBalancePda);
        if (!userBalanceInfo) {
          alert(`No balance account found. Use the faucet first to get cUSDC.`);
          setIsSolanaWrapping(false);
          return;
        }

        // Get or create user's SPL USDC token account (ATA)
        const userTokenAccount = await getAssociatedTokenAddress(
          SOLANA_CONFIG.splUsdcMint,
          solanaPublicKey
        );
        console.log("User Token Account:", userTokenAccount.toBase58());

        const transaction = new Transaction();

        // Check if user's ATA exists, if not create it
        const ataInfo = await connection.getAccountInfo(userTokenAccount);
        if (!ataInfo) {
          console.log("Creating user's USDC token account...");
          transaction.add(
            createAssociatedTokenAccountInstruction(
              solanaPublicKey, // payer
              userTokenAccount, // associated token account
              solanaPublicKey, // owner
              SOLANA_CONFIG.splUsdcMint // mint
            )
          );
        }

        // === Build unwrap_usdc_from_user instruction ===
        // unwrap_usdc_from_user discriminator from IDL
        const unwrapUsdcDiscriminator = new Uint8Array([140, 122, 95, 4, 106, 131, 99, 92]);

        // Args: amount (u64)
        const amountBytes = new Uint8Array(8);
        for (let i = 0; i < 8; i++) {
          amountBytes[i] = Number((amountValue >> BigInt(i * 8)) & BigInt(0xff));
        }

        const unwrapData = Buffer.concat([
          Buffer.from(unwrapUsdcDiscriminator),
          Buffer.from(amountBytes)
        ]);

        const unwrapInstruction = new TransactionInstruction({
          keys: [
            { pubkey: SOLANA_CONFIG.usdcVault, isSigner: false, isWritable: true },
            { pubkey: userTokenAccount, isSigner: false, isWritable: true },
            { pubkey: userBalancePda, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: solanaPublicKey, isSigner: true, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          programId: SOLANA_CONFIG.program,
          data: unwrapData,
        });
        transaction.add(unwrapInstruction);

        const signature = await sendSolanaTransaction(transaction, connection);
        await connection.confirmTransaction(signature, "confirmed");

        setSolanaTxSignature(signature);

        // Update local balance
        const currentBalance = parseFloat(confidentialUsdcBalance.replace(' cUSDC', '')) || 0;
        const newBalance = Math.max(0, currentBalance - burnAmount).toFixed(2);
        setConfidentialUsdcBalance(newBalance === "0.00" ? "0" : `${newBalance} cUSDC`);

        alert(`✅ Unwrapped with Inco FHE!\n\nSignature: ${signature}\n\n🔓 ${amount} cUSDC decrypted and burned\n💰 ${amount} USDC transferred to your wallet`);
        setIsSolanaWrapping(false);
        return;
      }

      // For SOL: Full on-chain unwrap from vault
      // === Derive user balance PDA ===
      const [userBalancePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_balance"), solanaPublicKey.toBuffer(), mint.toBuffer()],
        SOLANA_CONFIG.program
      );
      console.log("User Balance PDA:", userBalancePda.toBase58());

      // Check if user balance PDA exists
      const userBalanceInfo = await connection.getAccountInfo(userBalancePda);
      if (!userBalanceInfo) {
        alert(`No balance account found. You need to wrap SOL first to create your balance account.`);
        setIsSolanaWrapping(false);
        return;
      }
      console.log("User balance account exists:", userBalanceInfo.lamports, "lamports");

      // === Derive SOL vault PDA ===
      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("sol_vault_v2")],
        SOLANA_CONFIG.program
      );
      console.log("SOL Vault PDA:", solVaultPda.toBase58());

      // Check vault balance
      const vaultInfo = await connection.getAccountInfo(solVaultPda);
      if (!vaultInfo || vaultInfo.lamports < amountLamports) {
        alert(`Vault has insufficient funds. Need ${amount} SOL but vault has ${vaultInfo ? (vaultInfo.lamports / 1e9).toFixed(4) : 0} SOL.\n\nPlease wrap some SOL first to fund the vault.`);
        setIsSolanaWrapping(false);
        return;
      }
      console.log("Vault balance:", vaultInfo.lamports / 1e9, "SOL");

      // === Build unwrap_from_user instruction ===
      // unwrap_from_user discriminator from IDL
      const unwrapDiscriminator = new Uint8Array([118, 90, 235, 151, 219, 238, 41, 48]);

      // Args: amount (u64)
      const amountBytes = new Uint8Array(8);
      for (let i = 0; i < 8; i++) {
        amountBytes[i] = Number((amountValue >> BigInt(i * 8)) & BigInt(0xff));
      }

      const unwrapData = Buffer.concat([
        Buffer.from(unwrapDiscriminator),
        Buffer.from(amountBytes)
      ]);

      const unwrapInstruction = new TransactionInstruction({
        keys: [
          { pubkey: solVaultPda, isSigner: false, isWritable: true },
          { pubkey: userBalancePda, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: solanaPublicKey, isSigner: false, isWritable: true }, // user receives SOL
          { pubkey: solanaPublicKey, isSigner: true, isWritable: false }, // authority
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: SOLANA_CONFIG.program,
        data: unwrapData,
      });

      const transaction = new Transaction().add(unwrapInstruction);
      const signature = await sendSolanaTransaction(transaction, connection);
      await connection.confirmTransaction(signature, "confirmed");

      setSolanaTxSignature(signature);

      // Update local balance
      const currentBalance = parseFloat(confidentialSolBalance.replace(' cSOL', '')) || 0;
      const newBalance = Math.max(0, currentBalance - burnAmount).toFixed(4);
      setConfidentialSolBalance(newBalance === "0.0000" ? "0" : `${newBalance} cSOL`);

      alert(`✅ Unwrapped with Inco FHE!\n\nSignature: ${signature}\n\n🔓 ${amount} cSOL decrypted and burned\n💰 ${amount} SOL returned from vault to your wallet`);
    } catch (error: any) {
      console.error("Solana unwrap error:", error);
      // Try to extract detailed error info
      let errorMsg = error.message || "Unknown error";
      if (error.logs) {
        console.error("Transaction logs:", error.logs);
        errorMsg += "\n\nLogs: " + error.logs.slice(-3).join("\n");
      }
      if (error.error?.message) {
        errorMsg = error.error.message;
      }
      alert(`Unwrap failed: ${errorMsg}`);
    } finally {
      setIsSolanaWrapping(false);
    }
  };

  // Solana Transfer handler - transfers encrypted tokens between user PDAs
  const handleSolanaTransfer = async () => {
    if (!solanaPublicKey || !sendAmount || !sendRecipient || !sendSolanaTransaction) {
      alert("Please fill all fields");
      return;
    }

    setIsSending(true);
    try {
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");

      const isSOL = sendToken === "cETH"; // cETH maps to cSOL on Solana
      const mint = isSOL ? SOLANA_CONFIG.solMint : SOLANA_CONFIG.usdcMint;
      const decimals = isSOL ? 9 : 6;
      const amountLamports = Math.floor(parseFloat(sendAmount) * Math.pow(10, decimals));
      const amountValue = BigInt(amountLamports);

      // 🔐 Encrypt the transfer amount
      console.log("Encrypting transfer amount...", amountValue.toString());
      const encryptedHex = await encryptValue(amountValue);
      const encryptedBuffer = hexToBuffer(encryptedHex);

      // Convert to u128
      let encryptedU128 = BigInt(0);
      for (let i = 0; i < Math.min(16, encryptedBuffer.length); i++) {
        encryptedU128 |= BigInt(encryptedBuffer[i]) << BigInt(i * 8);
      }

      // Parse recipient as PublicKey
      let recipientPubkey: PublicKey;
      try {
        recipientPubkey = new PublicKey(sendRecipient);
      } catch {
        alert("Invalid recipient address");
        setIsSending(false);
        return;
      }

      // === Derive source user balance PDA ===
      const [sourceBalancePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_balance"), solanaPublicKey.toBuffer(), mint.toBuffer()],
        SOLANA_CONFIG.program
      );

      // === Derive destination user balance PDA ===
      const [destBalancePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_balance"), recipientPubkey.toBuffer(), mint.toBuffer()],
        SOLANA_CONFIG.program
      );
      console.log("Source Balance PDA:", sourceBalancePda.toBase58());
      console.log("Dest Balance PDA:", destBalancePda.toBase58());

      // Check if destination balance exists, if not initialize it
      const destBalanceInfo = await connection.getAccountInfo(destBalancePda);
      const transaction = new Transaction();

      if (!destBalanceInfo) {
        console.log("Initializing destination user balance account...");
        // For simplicity in this demo, we require the recipient to have an account
        // In production, sender could pay to initialize it
        alert(`Recipient ${sendRecipient.slice(0, 8)}... needs to wrap tokens first to create their balance account.`);
        setIsSending(false);
        return;
      }

      // === Build transfer_to_user instruction ===
      // transfer_to_user discriminator from IDL
      const transferDiscriminator = new Uint8Array([57, 90, 102, 225, 172, 136, 54, 176]);

      // Args: encrypted_amount (u128)
      const encryptedBytes = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        encryptedBytes[i] = Number((encryptedU128 >> BigInt(i * 8)) & BigInt(0xff));
      }

      const transferData = Buffer.concat([
        Buffer.from(transferDiscriminator),
        Buffer.from(encryptedBytes)
      ]);

      const transferInstruction = new TransactionInstruction({
        keys: [
          { pubkey: sourceBalancePda, isSigner: false, isWritable: true },
          { pubkey: destBalancePda, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: solanaPublicKey, isSigner: true, isWritable: false }, // source_user
          { pubkey: recipientPubkey, isSigner: false, isWritable: false }, // dest_user
        ],
        programId: SOLANA_CONFIG.program,
        data: transferData,
      });
      transaction.add(transferInstruction);

      const signature = await sendSolanaTransaction(transaction, connection);
      await connection.confirmTransaction(signature, "confirmed");

      setSolanaTxSignature(signature);
      const tokenSymbol = isSOL ? "cSOL" : "cUSDC";

      // Update sender's balance
      if (isSOL) {
        const currentBalance = parseFloat(confidentialSolBalance.replace(' cSOL', '')) || 0;
        const newBalance = Math.max(0, currentBalance - parseFloat(sendAmount)).toFixed(4);
        setConfidentialSolBalance(newBalance === "0.0000" ? "0" : `${newBalance} cSOL`);

        // Simulate receipt for demo (update recipient's local storage)
        try {
          const recipientKey = `cSOL_balance_${sendRecipient}`;
          const currentRecipient = parseFloat(localStorage.getItem(recipientKey) || '0');
          // Removing ' cSOL' if present in storage, though parseFloat usually handles leading numbers
          const cleanCurrent = parseFloat((localStorage.getItem(recipientKey) || '0').replace(' cSOL', ''));
          localStorage.setItem(recipientKey, (cleanCurrent + parseFloat(sendAmount)).toFixed(4) + " cSOL");
        } catch (e) { console.error("Could not update recipient local storage", e); }

      } else {
        const currentBalance = parseFloat(confidentialUsdcBalance.replace(' cUSDC', '')) || 0;
        const newBalance = Math.max(0, currentBalance - parseFloat(sendAmount)).toFixed(2);
        setConfidentialUsdcBalance(newBalance === "0.00" ? "0" : `${newBalance} cUSDC`);

        // Simulate receipt for demo
        try {
          const recipientKey = `cUSDC_balance_${sendRecipient}`;
          const cleanCurrent = parseFloat((localStorage.getItem(recipientKey) || '0').replace(' cUSDC', ''));
          localStorage.setItem(recipientKey, (cleanCurrent + parseFloat(sendAmount)).toFixed(2) + " cUSDC");
        } catch (e) { console.error("Could not update recipient local storage", e); }
      }

      alert(`✅ Private Transfer Successful!\n\nSignature: ${signature}\n\n🔐 Sent ${sendAmount} ${tokenSymbol} to:\n${sendRecipient.slice(0, 8)}...${sendRecipient.slice(-8)}\n\n(Amount is encrypted on-chain - only recipient can decrypt)`);
    } catch (error: any) {
      console.error("Solana transfer error:", error);
      alert(`Transfer failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsSending(false);
    }
  };

  // Solana Faucet handler - get free test USDC for swap testing
  const [isRequestingFaucet, setIsRequestingFaucet] = useState(false);

  const handleFaucetUsdc = async () => {
    if (!solanaPublicKey || !sendSolanaTransaction) {
      alert("Please connect your Solana wallet");
      return;
    }

    setIsRequestingFaucet(true);
    try {
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");

      // Faucet amount: 100 USDC (6 decimals)
      const faucetAmount = BigInt(100_000_000); // 100 USDC

      // Encrypt the faucet amount
      console.log("Encrypting faucet amount...");
      const encryptedHex = await encryptValue(faucetAmount);
      const encryptedBuffer = Buffer.from(hexToBuffer(encryptedHex));
      const encryptedU128 = BigInt("0x" + encryptedBuffer.toString("hex").slice(0, 32));

      // Derive user balance PDA for USDC
      const [userBalancePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_balance"), solanaPublicKey.toBuffer(), SOLANA_CONFIG.usdcMint.toBuffer()],
        SOLANA_CONFIG.program
      );
      console.log("User USDC Balance PDA:", userBalancePda.toBase58());

      // Build faucet_usdc instruction
      // faucet_usdc discriminator from IDL
      const faucetDiscriminator = new Uint8Array([190, 45, 226, 28, 94, 130, 98, 127]);

      // Args: encrypted_amount (u128)
      const encryptedBytes = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
        encryptedBytes[i] = Number((encryptedU128 >> BigInt(i * 8)) & BigInt(0xff));
      }

      const faucetData = Buffer.concat([
        Buffer.from(faucetDiscriminator),
        Buffer.from(encryptedBytes)
      ]);

      const faucetInstruction = new TransactionInstruction({
        keys: [
          { pubkey: userBalancePda, isSigner: false, isWritable: true },
          { pubkey: SOLANA_CONFIG.usdcMint, isSigner: false, isWritable: false },
          { pubkey: solanaPublicKey, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: SOLANA_CONFIG.program,
        data: faucetData,
      });

      const transaction = new Transaction().add(faucetInstruction);
      const signature = await sendSolanaTransaction(transaction, connection);
      await connection.confirmTransaction(signature, "confirmed");

      setSolanaTxSignature(signature);

      // Update local balance
      setConfidentialUsdcBalance("100 cUSDC");

      alert(`✅ Faucet Success!\n\nSignature: ${signature}\n\n💰 Received 100 test cUSDC\n\nYou can now test the swap feature!`);
    } catch (error: any) {
      console.error("Faucet error:", error);
      alert(`Faucet failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsRequestingFaucet(false);
    }
  };






  // Solana Swap handler - swaps between cSOL and cUSDC
  const [isSwapping, setIsSwapping] = useState(false);

  const handleSolanaSwap = async () => {
    if (!solanaPublicKey || !amount || !sendSolanaTransaction) {
      alert("Please connect wallet and enter amount");
      return;
    }

    setIsSwapping(true);
    try {
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");

      // selectedToken === "ETH" means cUSDC -> cSOL
      // selectedToken === "USDC" means cSOL -> cUSDC
      const isBuyingSOL = selectedToken === "ETH";
      const fromDecimals = isBuyingSOL ? 6 : 9; // USDC has 6, SOL has 9
      const toDecimals = isBuyingSOL ? 9 : 6;

      const amountLamports = Math.floor(parseFloat(amount) * Math.pow(10, fromDecimals));
      const amountValue = BigInt(amountLamports);

      // 🔐 Encrypt the swap amount
      console.log("Encrypting swap amount...", amountValue.toString());
      const encryptedHex = await encryptValue(amountValue);
      const ciphertext = hexToBuffer(encryptedHex);

      // For a real swap, we'd call the AMM program
      // Demo: we simulate by burning from one and minting to other

      // BURN from source token
      const burnDiscriminator = new Uint8Array([116, 110, 29, 56, 107, 219, 42, 93]);
      const inputType = new Uint8Array([0]);

      const lengthBytes = new Uint8Array(4);
      new DataView(lengthBytes.buffer).setUint32(0, ciphertext.length, true);

      const burnData = Buffer.concat([
        Buffer.from(burnDiscriminator),
        Buffer.from(lengthBytes),
        ciphertext,
        Buffer.from(inputType)
      ]);

      const fromAccount = isBuyingSOL ? SOLANA_CONFIG.usdcAccount : SOLANA_CONFIG.solAccount;
      const fromMint = isBuyingSOL ? SOLANA_CONFIG.usdcMint : SOLANA_CONFIG.solMint;
      const INCO_LIGHTNING_PROGRAM_ID = new PublicKey("5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj");

      const burnInstruction = new TransactionInstruction({
        keys: [
          { pubkey: fromAccount, isSigner: false, isWritable: true },
          { pubkey: fromMint, isSigner: false, isWritable: true },
          { pubkey: solanaPublicKey, isSigner: true, isWritable: true },
          { pubkey: INCO_LIGHTNING_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: SOLANA_CONFIG.program,
        data: burnData,
      });

      // MINT to destination token using real SOL price
      // SOL is around $200 USD, so:
      // - 1 USDC buys 1/200 = 0.005 SOL
      // - 1 SOL buys 200 USDC
      const SOL_USD_PRICE = 200; // Real-time: fetch from Pyth/Coingecko in production

      const toAmount = isBuyingSOL
        ? BigInt(Math.floor((parseFloat(amount) / SOL_USD_PRICE) * Math.pow(10, 9))) // USDC → SOL: divide by SOL price
        : BigInt(Math.floor(parseFloat(amount) * SOL_USD_PRICE * Math.pow(10, 6))); // SOL → USDC: multiply by SOL price

      const encryptedToHex = await encryptValue(toAmount);
      const toCiphertext = hexToBuffer(encryptedToHex);

      const mintDiscriminator = new Uint8Array([241, 34, 48, 186, 37, 179, 123, 192]);
      const mintLengthBytes = new Uint8Array(4);
      new DataView(mintLengthBytes.buffer).setUint32(0, toCiphertext.length, true);

      const mintData = Buffer.concat([
        Buffer.from(mintDiscriminator),
        Buffer.from(mintLengthBytes),
        toCiphertext,
        Buffer.from(inputType)
      ]);

      const toAccount = isBuyingSOL ? SOLANA_CONFIG.solAccount : SOLANA_CONFIG.usdcAccount;
      const toMint = isBuyingSOL ? SOLANA_CONFIG.solMint : SOLANA_CONFIG.usdcMint;

      const mintInstruction = new TransactionInstruction({
        keys: [
          { pubkey: toMint, isSigner: false, isWritable: true },
          { pubkey: toAccount, isSigner: false, isWritable: true },
          { pubkey: solanaPublicKey, isSigner: true, isWritable: true },
          { pubkey: INCO_LIGHTNING_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: SOLANA_CONFIG.program,
        data: mintData,
      });

      const transaction = new Transaction()
        .add(burnInstruction)
        .add(mintInstruction);

      const signature = await sendSolanaTransaction(transaction, connection);
      await connection.confirmTransaction(signature, "confirmed");

      setSolanaTxSignature(signature);

      // Update balances with real price
      const fromSymbol = isBuyingSOL ? "cUSDC" : "cSOL";
      const toSymbol = isBuyingSOL ? "cSOL" : "cUSDC";
      const outputAmount = isBuyingSOL
        ? (parseFloat(amount) / SOL_USD_PRICE).toFixed(6)
        : (parseFloat(amount) * SOL_USD_PRICE).toFixed(2);

      if (isBuyingSOL) {
        const currentUsdc = parseFloat(confidentialUsdcBalance.replace(' cUSDC', '')) || 0;
        setConfidentialUsdcBalance(Math.max(0, currentUsdc - parseFloat(amount)).toFixed(2) + " cUSDC");
        const currentSol = parseFloat(confidentialSolBalance.replace(' cSOL', '')) || 0;
        setConfidentialSolBalance((currentSol + parseFloat(outputAmount)).toFixed(4) + " cSOL");
      } else {
        const currentSol = parseFloat(confidentialSolBalance.replace(' cSOL', '')) || 0;
        setConfidentialSolBalance(Math.max(0, currentSol - parseFloat(amount)).toFixed(4) + " cSOL");
        const currentUsdc = parseFloat(confidentialUsdcBalance.replace(' cUSDC', '')) || 0;
        setConfidentialUsdcBalance((currentUsdc + parseFloat(outputAmount)).toFixed(2) + " cUSDC");
      }

      alert(`✅ Private Swap Complete!\n\nSignature: ${signature}\n\n🔐 Swapped ${amount} ${fromSymbol} → ${outputAmount} ${toSymbol}\n\n(Both amounts encrypted on-chain)`);
    } catch (error: any) {
      console.error("Solana swap error:", error);
      alert(`Swap failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsSwapping(false);
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

          {/* Dual Wallet Connection */}
          <div className="flex items-center gap-3">
            {/* EVM Wallet */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[8px] text-gray-500 uppercase">Base</span>
              {isConnected ? (
                <div className="flex items-center gap-2 border border-[var(--neon-purple)] px-3 py-1 bg-black/50">
                  <span className="text-[10px] text-[var(--neon-purple)]">
                    {address?.slice(0, 4)}...{address?.slice(-3)}
                  </span>
                  <button
                    onClick={() => disconnect()}
                    className="text-[8px] text-red-500 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => connect({ connector: connectors[0] })}
                  className="px-3 py-1 bg-[var(--neon-purple)] text-black text-[10px] font-bold uppercase hover:opacity-80"
                >
                  Connect
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-gray-700"></div>

            {/* Solana Wallet */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[8px] text-gray-500 uppercase">Solana</span>
              {solanaConnected && solanaPublicKey ? (
                <div className="flex items-center gap-2 border border-[var(--neon-green)] px-3 py-1 bg-black/50">
                  <span className="text-[10px] text-[var(--neon-green)]">
                    {solanaPublicKey.toString().slice(0, 4)}...{solanaPublicKey.toString().slice(-3)}
                  </span>
                </div>
              ) : (
                <WalletMultiButton className="!bg-[var(--neon-green)] !text-black !text-[10px] !font-bold !uppercase !px-3 !py-1 !h-auto !rounded-none hover:!opacity-80" />
              )}
            </div>
          </div>
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

        {/* Solana Balance Display */}
        {solanaConnected && (
          <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Public SOL Balance */}
            <div className="border-4 border-gray-700 bg-black p-4 relative">
              <h3 className="text-[10px] text-gray-500 uppercase mb-4 border-b-2 border-gray-800 pb-2 text-center">
                Solana Wallet
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-gray-400 text-xs">SOL</span>
                  <span className="text-white text-sm">
                    {solBalance !== null ? solBalance.toFixed(4) : "..."}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-gray-400 text-xs">USDC</span>
                  <span className="text-white text-sm">{splUsdcBalance.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Confidential Solana Balances */}
            <div className="border-4 border-[var(--neon-green)] bg-black p-4 relative shadow-[0_0_20px_rgba(0,255,100,0.2)]">
              <div className="flex justify-between items-center mb-4 border-b-2 border-[var(--neon-green)] pb-2">
                <h3 className="text-[10px] text-[var(--neon-green)] uppercase animate-pulse">Encrypted (Solana)</h3>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-[var(--neon-green)] text-xs">cSOL</span>
                  <span className="text-sm text-[var(--neon-green)]">
                    {confidentialSolBalance}
                  </span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-[var(--neon-green)] text-xs">cUSDC</span>
                  <span className="text-sm text-[var(--neon-green)]">{confidentialUsdcBalance}</span>
                </div>
              </div>
              {solanaTxSignature && (
                <div className="mt-4 pt-2 border-t border-[var(--neon-green)]/30">
                  <p className="text-[8px] text-gray-500">LAST TX:</p>
                  <a
                    href={`https://explorer.solana.com/tx/${solanaTxSignature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[8px] text-[var(--neon-green)] hover:underline break-all"
                  >
                    {solanaTxSignature.slice(0, 20)}...
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-8">
          {(["wrap", "unwrap", "swap", "send", "bridge"] as TabType[]).map((tab) => (
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

          {/* Chain Selector */}
          {activeTab !== "bridge" && (
            <div className="flex justify-center gap-2 mb-6">
              <button
                onClick={() => setSelectedChain("base")}
                className={`px-4 py-2 text-[10px] uppercase font-bold transition-all border-2 ${selectedChain === "base"
                  ? "bg-[var(--neon-purple)] text-black border-[var(--neon-purple)]"
                  : "bg-transparent text-gray-500 border-gray-700 hover:border-gray-500"
                  }`}
              >
                🔷 Base
              </button>
              <button
                onClick={() => setSelectedChain("solana")}
                className={`px-4 py-2 text-[10px] uppercase font-bold transition-all border-2 ${selectedChain === "solana"
                  ? "bg-[var(--neon-green)] text-black border-[var(--neon-green)]"
                  : "bg-transparent text-gray-500 border-gray-700 hover:border-gray-500"
                  }`}
              >
                ◎ Solana
              </button>
            </div>
          )}

          {activeTab === "wrap" && (
            <>
              <h2 className="text-lg text-white mb-6 uppercase text-center border-b-2 border-dashed border-gray-700 pb-4">
                Asset Encryption {selectedChain === "solana" && <span className="text-[var(--neon-green)]">(Solana)</span>}
              </h2>

              {/* Solana Wrap Content */}
              {selectedChain === "solana" ? (
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setSelectedToken("ETH")}
                      className={`flex-1 py-2 border-2 text-[10px] uppercase ${selectedToken === "ETH"
                        ? "border-[var(--neon-green)] text-[var(--neon-green)] bg-[var(--neon-green)]/10"
                        : "border-gray-800 text-gray-600"
                        }`}
                    >
                      SOL → cSOL
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

                  <div>
                    <label className="text-[10px] text-gray-400 uppercase mb-2 block">Amount</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.0"
                        className="w-full bg-black border-2 border-gray-600 p-4 text-[var(--neon-green)] text-xl font-mono focus:border-[var(--neon-green)] focus:outline-none transition-all placeholder-gray-800"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-bold uppercase">
                        {selectedToken === "ETH" ? "SOL" : "USDC"}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSolanaWrap}
                    disabled={!solanaConnected || isSolanaWrapping}
                    className="w-full py-4 bg-[var(--neon-green)] text-black font-bold uppercase tracking-widest border-b-4 border-r-4 border-green-700 active:border-0 active:translate-y-1 transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    {!solanaConnected ? "Connect Solana Wallet" : isSolanaWrapping ? "Processing..." : "ENCRYPT ON SOLANA"}
                  </button>

                  <p className="text-[8px] text-gray-500 text-center">
                    Program: h6T7wsEJWMxN2uEZUc4SipEd8Zmz2DWasCDopindjC5
                  </p>

                  {/* Test USDC Faucet */}
                  <div className="mt-4 pt-4 border-t border-dashed border-gray-700">
                    <button
                      onClick={handleFaucetUsdc}
                      disabled={!solanaConnected || isRequestingFaucet}
                      className="w-full py-2 bg-[#14b8a6] text-black text-[10px] font-bold uppercase tracking-wide border-b-2 border-r-2 border-teal-700 active:border-0 active:translate-y-[2px] transition-all disabled:opacity-50"
                    >
                      {isRequestingFaucet ? "Minting..." : "🚰 Get 100 Test cUSDC (Faucet)"}
                    </button>
                    <p className="text-[8px] text-gray-500 text-center mt-1">
                      Free test tokens for swap testing
                    </p>
                  </div>
                </div>
              ) : (
                /* Base/EVM Wrap Content */
                <>

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
            </>
          )}

          {activeTab === "unwrap" && (
            <>
              <h2 className="text-lg text-white mb-6 uppercase text-center border-b-2 border-dashed border-gray-700 pb-4">
                Asset Decryption {selectedChain === "solana" && <span className="text-[var(--neon-green)]">(Solana)</span>}
              </h2>

              {selectedChain === "solana" ? (
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setSelectedToken("ETH")}
                      className={`flex-1 py-2 border-2 text-[10px] uppercase ${selectedToken === "ETH"
                        ? "border-red-500 text-red-500 bg-red-500/10"
                        : "border-gray-800 text-gray-600"
                        }`}
                    >
                      cSOL → SOL
                    </button>
                    <button
                      onClick={() => setSelectedToken("USDC")}
                      className={`flex-1 py-2 border-2 text-[10px] uppercase ${selectedToken === "USDC"
                        ? "border-red-500 text-red-500 bg-red-500/10"
                        : "border-gray-800 text-gray-600"
                        }`}
                    >
                      cUSDC → USDC
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 uppercase mb-2 block">Amount</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.0"
                        className="w-full bg-black border-2 border-gray-600 p-4 text-red-500 text-xl font-mono focus:border-red-500 focus:outline-none transition-all placeholder-gray-800"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-bold uppercase">
                        {selectedToken === "ETH" ? "cSOL" : "cUSDC"}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSolanaBurn}
                    disabled={!solanaConnected || isSolanaWrapping}
                    className="w-full py-4 bg-red-500 text-black font-bold uppercase tracking-widest border-b-4 border-r-4 border-red-800 active:border-0 active:translate-y-1 transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    {!solanaConnected ? "Connect Solana Wallet" : isSolanaWrapping ? "Processing..." : "DECRYPT ON SOLANA"}
                  </button>
                </div>
              ) : (
                <>
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
            </>
          )}

          {activeTab === "swap" && (
            <>
              <h2 className="text-lg text-white mb-6 uppercase text-center border-b-2 border-dashed border-gray-700 pb-4">
                {selectedChain === "solana" ? "Private AMM" : "Inco DEX"} {selectedChain === "solana" && <span className="text-[var(--neon-green)]">(Solana)</span>}
              </h2>

              {selectedChain === "solana" ? (
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setSelectedToken("ETH")}
                      className={`flex-1 py-2 border-2 text-[10px] uppercase ${selectedToken === "ETH"
                        ? "border-[var(--neon-green)] text-[var(--neon-green)] bg-[var(--neon-green)]/10"
                        : "border-gray-800 text-gray-600"
                        }`}
                    >
                      cUSDC → cSOL
                    </button>
                    <button
                      onClick={() => setSelectedToken("USDC")}
                      className={`flex-1 py-2 border-2 text-[10px] uppercase ${selectedToken === "USDC"
                        ? "border-[var(--neon-green)] text-[var(--neon-green)] bg-[var(--neon-green)]/10"
                        : "border-gray-800 text-gray-600"
                        }`}
                    >
                      cSOL → cUSDC
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 uppercase mb-2 block">Amount</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.0"
                        className="w-full bg-black border-2 border-[var(--neon-purple)] p-4 text-[var(--neon-purple)] text-xl font-mono focus:outline-none focus:shadow-[0_0_15px_var(--neon-purple)] transition-all placeholder-gray-800"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-bold uppercase">
                        {selectedToken === "ETH" ? "cUSDC" : "cSOL"}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 border border-[var(--neon-green)]/30 bg-[var(--neon-green)]/5">
                    <div className="flex justify-between text-[10px] uppercase">
                      <span className="text-gray-500">Pool</span>
                      <span className="text-[var(--neon-green)]">SOL/USDC (Encrypted)</span>
                    </div>
                    <div className="flex justify-between text-[10px] uppercase mt-1">
                      <span className="text-gray-500">Slippage</span>
                      <span className="text-[var(--neon-green)]">5% max</span>
                    </div>
                  </div>

                  <button
                    onClick={handleSolanaSwap}
                    disabled={!solanaConnected || !amount || isSwapping}
                    className="w-full py-4 bg-[var(--neon-purple)] text-white font-bold uppercase tracking-widest border-b-4 border-r-4 border-purple-900 active:border-0 active:translate-y-1 transition-all disabled:opacity-50 disabled:grayscale shadow-[0_0_15px_var(--neon-purple)]"
                  >
                    {!solanaConnected ? "Connect Solana Wallet" : isSwapping ? "Swapping..." : "PRIVATE SWAP"}
                  </button>

                  <p className="text-[8px] text-gray-500 text-center">
                    Program: 2UgU5dyB9Z7XEGKn3SW8CFz794ajVrSo4fuEJMQdM1t7
                  </p>
                </div>
              ) : (
                <>
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
            </>
          )}

          {activeTab === "send" && (
            <>
              <h2 className="text-lg text-white mb-6 uppercase text-center border-b-2 border-dashed border-gray-700 pb-4">
                Shadow Transfer {selectedChain === "solana" && <span className="text-[var(--neon-green)]">(Solana)</span>}
              </h2>

              {selectedChain === "solana" ? (
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <button
                      onClick={() => setSendToken("cETH")}
                      className={`flex-1 py-2 border-2 text-[10px] uppercase ${sendToken === "cETH"
                        ? "border-[var(--neon-green)] text-[var(--neon-green)] bg-[var(--neon-green)]/10"
                        : "border-gray-800 text-gray-600"
                        }`}
                    >
                      cSOL
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

                  <div>
                    <label className="text-[10px] text-gray-400 uppercase mb-2 block">Recipient (Solana Address)</label>
                    <input
                      type="text"
                      value={sendRecipient}
                      onChange={(e) => setSendRecipient(e.target.value)}
                      placeholder="So1ana..."
                      className="w-full bg-black border-2 border-white/20 p-3 text-white font-mono text-xs focus:border-[var(--neon-green)] focus:outline-none transition-all placeholder-gray-700"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 uppercase mb-2 block">Amount</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={sendAmount}
                        onChange={(e) => setSendAmount(e.target.value)}
                        placeholder="0.0"
                        className="w-full bg-black border-2 border-[var(--neon-green)] p-4 text-[var(--neon-green)] text-xl font-mono focus:outline-none focus:shadow-[0_0_15px_var(--neon-green)] transition-all placeholder-gray-800"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSolanaTransfer}
                    disabled={!solanaConnected || !sendRecipient || !sendAmount || isSending}
                    className="w-full py-4 bg-white text-black font-bold uppercase tracking-widest border-b-4 border-r-4 border-gray-400 active:border-0 active:translate-y-1 transition-all disabled:opacity-50"
                  >
                    {!solanaConnected ? "Connect Solana Wallet" : isSending ? "Sending..." : "SEND ON SOLANA"}
                  </button>
                </div>
              ) : (
                <>
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

          {/* Solana Liquidity Pool Control */}

        </div>
      </div>
    </main>
  );

}
