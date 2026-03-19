"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WalletHeader from "@/components/WalletHeader";
import AssetList from "@/components/AssetList";
import TransactionList from "@/components/TransactionList";
import { getPrimaryWallet, type StoredWallet } from "@/lib/wallet-store";
import { getAssets, getTransactions, getPoolPrice } from "@/lib/api";
import type { Assets, Transaction as ApiTx } from "@/lib/api";
import { weiToEth, type AlgorithmType } from "@/lib/utils";

export default function Dashboard() {
  const router = useRouter();
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Assets | null>(null);
  const [transactions, setTransactions] = useState<ApiTx[]>([]);
  const [ethPrice, setEthPrice] = useState<number>(2000);

  useEffect(() => {
    getPrimaryWallet().then((w) => {
      if (!w) {
        router.push("/create");
      } else {
        setWallet(w);
        setLoading(false);
      }
    });
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!wallet) return;
    try {
      const [a, t, p] = await Promise.allSettled([
        getAssets(wallet.walletAddress),
        getTransactions(wallet.walletAddress),
        getPoolPrice(),
      ]);
      if (a.status === "fulfilled") setAssets(a.value);
      if (t.status === "fulfilled") setTransactions(t.value);
      if (p.status === "fulfilled") setEthPrice(p.value.ethUsd);
    } catch {
      // Backend may not be running
    }
  }, [wallet]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400 text-sm">Loading wallet...</div>
      </div>
    );
  }

  if (!wallet) return null;

  const ethBalance = assets ? weiToEth(assets.eth) : "0.0000";

  return (
    <div className="space-y-6">
      <WalletHeader
        address={wallet.walletAddress}
        algorithm={wallet.algorithm as AlgorithmType}
        balance={ethBalance}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/send"
          className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-[#037DD6] hover:shadow-card-hover transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-[#EAF6FF] flex items-center justify-center">
              <svg className="w-5 h-5 text-[#037DD6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 group-hover:text-[#037DD6] transition-colors">
              Send ETH
            </h3>
          </div>
          <p className="text-sm text-gray-500">
            Transfer ETH to any address with PQ signature
          </p>
        </Link>
        <Link
          href="/swap"
          className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-[#7B61FF] hover:shadow-card-hover transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-[#F0EDFF] flex items-center justify-center">
              <svg className="w-5 h-5 text-[#7B61FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 group-hover:text-[#7B61FF] transition-colors">
              Swap ETH/USD
            </h3>
          </div>
          <p className="text-sm text-gray-500">
            Trade ETH for USD on Uniswap V3 with PQ security
          </p>
        </Link>
      </div>

      <AssetList
        eth={ethBalance}
        weth={assets ? weiToEth(assets.weth) : "0.0000"}
        usd={assets ? weiToEth(assets.usd) : "0.00"}
        ethPrice={ethPrice}
      />

      <TransactionList
        transactions={transactions.map((tx) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: weiToEth(tx.value),
          status: tx.status,
          type: tx.type,
        }))}
      />
    </div>
  );
}
