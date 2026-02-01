"use client";

import { http, createConfig, WagmiProvider } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "wagmi/connectors";
import { SolanaProvider } from "@/providers/SolanaProvider";

const config = createConfig({
    chains: [baseSepolia],
    connectors: [injected()],
    transports: {
        [baseSepolia.id]: http("https://base-sepolia-rpc.publicnode.com"),
    },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <SolanaProvider>{children}</SolanaProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
