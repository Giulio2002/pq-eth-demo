"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import AddressLink from "@/components/AddressLink";
import TxHashLink from "@/components/TxHashLink";
import AlgorithmBadge from "@/components/AlgorithmBadge";
import {
  getStats,
  getRecentTransactions,
  getRecentBlocks,
  getBlockNumber,
  type ExplorerStats,
  type ExplorerTransaction,
  type ExplorerBlock,
} from "@/lib/api";
import { weiToEth, timeAgo } from "@/lib/utils";

export default function DashboardPage() {
  const [stats, setStats] = useState<ExplorerStats | null>(null);
  const [transactions, setTransactions] = useState<ExplorerTransaction[]>([]);
  const [blocks, setBlocks] = useState<ExplorerBlock[]>([]);
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = useCallback(async () => {
    const [statsData, txData, blockData, blockNum] = await Promise.all([
      getStats(),
      getRecentTransactions(20),
      getRecentBlocks(10),
      getBlockNumber(),
    ]);
    setStats(statsData);
    // Sort transactions by timestamp descending (most recent first)
    const sortedTx = [...txData].sort((a, b) => b.timestamp - a.timestamp);
    setTransactions(sortedTx);
    setBlocks(blockData);
    setCurrentBlock(statsData?.currentBlock || blockNum);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totalWallets = stats?.totalWallets ?? 0;
  const totalPqTx = stats?.totalPqTransactions ?? 0;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    if (q.startsWith("0x") && q.length === 66) {
      window.location.href = `/tx/${q}`;
    } else if (q.startsWith("0x") && q.length === 42) {
      window.location.href = `/address/${q}`;
    } else if (/^\d+$/.test(q)) {
      window.location.href = `/block/${q}`;
    }
  };

  return (
    <div>
      {/* Dark Navy Hero Section */}
      <div className="bg-[#21325b] py-12 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            The PQ-ETH Blockchain Explorer
          </h1>
          <p className="text-blue-200/80 mb-6 text-sm">
            Post-Quantum Ethereum Devnet
          </p>
          <form onSubmit={handleSearch} className="max-w-2xl">
            <div className="flex">
              <input
                type="text"
                placeholder="Search by Address / Tx Hash / Block Number"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-4 py-3 rounded-l-lg border-0 text-sm text-[#1a1a1a] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="submit"
                className="bg-[#3498db] hover:bg-[#2980b9] text-white px-6 py-3 rounded-r-lg font-medium text-sm transition-colors"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-10">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 -mt-2">
          <StatCard
            label="ETH Price"
            value="$2,000.00"
            color="text-[#1a1a1a]"
            icon={
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#0784C3]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1.5l-7 10.917L12 16.5l7-4.083L12 1.5zM5 13.833L12 22.5l7-8.667L12 17.917l-7-4.084z" />
                </svg>
              </div>
            }
          />
          <StatCard
            label="PQ Transactions"
            value={loading ? "..." : totalPqTx}
            color="text-[#0784C3]"
            icon={
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#0784C3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </div>
            }
          />
          <StatCard
            label="PQ Wallets"
            value={loading ? "..." : totalWallets}
            color="text-purple-600"
            icon={
              <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            }
          />
          <StatCard
            label="Latest Block"
            value={loading ? "..." : currentBlock}
            color="text-[#1a1a1a]"
            icon={
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-[#6c757d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            }
          />
        </div>

        {/* Algorithm Breakdown */}
        <div className="bg-white border border-[#e7eaf3] rounded-lg p-6">
          <h2 className="text-base font-semibold text-[#1a1a1a] mb-4">Algorithm Breakdown</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {loading ? "..." : stats?.falconDirectWallets ?? 0}
              </div>
              <div className="text-xs text-[#6c757d] mt-1">Falcon-512 Direct</div>
              <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{
                    width: totalWallets > 0 ? `${((stats?.falconDirectWallets ?? 0) / totalWallets) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-teal-600">
                {loading ? "..." : stats?.falconNttWallets ?? 0}
              </div>
              <div className="text-xs text-[#6c757d] mt-1">Falcon-512 NTT</div>
              <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full"
                  style={{
                    width: totalWallets > 0 ? `${((stats?.falconNttWallets ?? 0) / totalWallets) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {loading ? "..." : stats?.dilithiumDirectWallets ?? 0}
              </div>
              <div className="text-xs text-[#6c757d] mt-1">Dilithium-2 Direct</div>
              <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full"
                  style={{
                    width: totalWallets > 0 ? `${((stats?.dilithiumDirectWallets ?? 0) / totalWallets) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-pink-600">
                {loading ? "..." : stats?.dilithiumNttWallets ?? 0}
              </div>
              <div className="text-xs text-[#6c757d] mt-1">Dilithium-2 NTT</div>
              <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-pink-500 rounded-full"
                  style={{
                    width: totalWallets > 0 ? `${((stats?.dilithiumNttWallets ?? 0) / totalWallets) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
          </div>
          {totalWallets === 0 && !loading && (
            <p className="text-center text-[#6c757d] mt-4">No PQ wallets deployed yet</p>
          )}
        </div>

        {/* Side-by-side Latest Blocks and Latest Transactions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Latest Blocks */}
          <div className="bg-white border border-[#e7eaf3] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e7eaf3] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1a1a1a]">Latest Blocks</h2>
              <Link
                href="/blocks"
                className="text-xs text-[#0784C3] hover:text-blue-800 bg-blue-50 border border-blue-100 rounded px-3 py-1 font-medium"
              >
                View all blocks
              </Link>
            </div>
            <div className="divide-y divide-[#e7eaf3]">
              {loading && blocks.length === 0 ? (
                <div className="py-10 text-center text-[#6c757d]">Loading blocks...</div>
              ) : blocks.length === 0 ? (
                <div className="py-10 text-center text-[#6c757d]">No blocks yet</div>
              ) : (
                blocks.slice(0, 6).map((block) => (
                  <div key={block.number} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                      <span className="text-xs font-medium text-[#6c757d]">Bk</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/block/${block.number}`}
                          className="text-[#0784C3] hover:text-blue-800 font-medium text-sm"
                        >
                          {block.number}
                        </Link>
                        <span className="text-xs text-[#6c757d]">{timeAgo(block.timestamp)}</span>
                      </div>
                      <div className="text-xs text-[#6c757d] mt-0.5">
                        {block.txCount} txn{block.txCount !== 1 ? "s" : ""}
                        {block.pqTxCount > 0 && (
                          <span className="ml-1 text-purple-600 font-medium">({block.pqTxCount} PQ)</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Latest Transactions */}
          <div className="bg-white border border-[#e7eaf3] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e7eaf3] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1a1a1a]">Latest Transactions</h2>
              <Link
                href="/transactions"
                className="text-xs text-[#0784C3] hover:text-blue-800 bg-blue-50 border border-blue-100 rounded px-3 py-1 font-medium"
              >
                View all txns
              </Link>
            </div>
            <div className="divide-y divide-[#e7eaf3]">
              {loading && transactions.length === 0 ? (
                <div className="py-10 text-center text-[#6c757d]">Loading transactions...</div>
              ) : transactions.length === 0 ? (
                <div className="py-10 text-center text-[#6c757d]">No transactions yet</div>
              ) : (
                transactions.slice(0, 6).map((tx) => (
                  <div key={tx.hash} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                      <span className="text-xs font-medium text-[#6c757d]">Tx</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <TxHashLink hash={tx.hash} />
                        <span className="text-xs text-[#6c757d]">{timeAgo(tx.timestamp)}</span>
                      </div>
                      <div className="text-xs text-[#6c757d] mt-0.5 truncate">
                        From <AddressLink address={tx.from} /> To <AddressLink address={tx.to} />
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      <span className="inline-block bg-gray-100 border border-[#e7eaf3] rounded px-2 py-0.5 font-mono text-xs text-[#1a1a1a]">
                        {weiToEth(tx.value)} ETH
                      </span>
                      <AlgorithmBadge scheme={tx.signatureScheme || "ecdsa"} size="sm" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
