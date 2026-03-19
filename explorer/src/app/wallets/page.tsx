"use client";

import React, { useEffect, useState, useCallback } from "react";
import AddressLink from "@/components/AddressLink";
import AlgorithmBadge from "@/components/AlgorithmBadge";
import DataTable from "@/components/DataTable";
import { getWallets, type ExplorerWallet } from "@/lib/api";
import { weiToEth, schemeFromAlgorithm, timeAgo } from "@/lib/utils";

type SortOption = "newest" | "most_transactions" | "highest_balance";
type AlgorithmFilter = "" | "falcon-direct" | "falcon-ntt" | "dilithium-direct" | "dilithium-ntt";

const PAGE_SIZE = 20;

export default function WalletsPage() {
  const [wallets, setWallets] = useState<ExplorerWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [algorithm, setAlgorithm] = useState<AlgorithmFilter>("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [page, setPage] = useState(1);

  const fetchWallets = useCallback(async () => {
    const data = await getWallets({
      algorithm: algorithm || undefined,
      sort,
      limit: 200,
    });
    setWallets(data);
    setLoading(false);
  }, [algorithm, sort]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchWallets();
    const interval = setInterval(fetchWallets, 10000);
    return () => clearInterval(interval);
  }, [fetchWallets]);

  const totalPages = Math.max(1, Math.ceil(wallets.length / PAGE_SIZE));
  const pageWallets = wallets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1a1a1a]">PQ Wallets</h1>
        <p className="text-[#6c757d] text-sm mt-1">
          All deployed post-quantum smart wallets
          {wallets.length > 0 && (
            <span className="ml-2 text-[#6c757d]">({wallets.length} total)</span>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div>
          <label className="text-sm text-[#6c757d] mr-2">Algorithm:</label>
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as AlgorithmFilter)}
            className="bg-white border border-[#e7eaf3] text-[#1a1a1a] text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0784C3] focus:border-[#0784C3]"
          >
            <option value="">All</option>
            <option value="falcon-direct">Falcon-512 Direct</option>
            <option value="falcon-ntt">Falcon-512 NTT</option>
            <option value="dilithium-direct">Dilithium-2 Direct</option>
            <option value="dilithium-ntt">Dilithium-2 NTT</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-[#6c757d] mr-2">Sort:</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="bg-white border border-[#e7eaf3] text-[#1a1a1a] text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0784C3] focus:border-[#0784C3]"
          >
            <option value="newest">Newest</option>
            <option value="most_transactions">Most Transactions</option>
            <option value="highest_balance">Highest Balance</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-[#e7eaf3] rounded-lg overflow-hidden">
        <DataTable
          headers={["Address", "Algorithm", "Created", "Transactions", "ETH Balance"]}
          isEmpty={pageWallets.length === 0}
          emptyMessage={loading ? "Loading wallets..." : "No PQ wallets found"}
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
        >
          {pageWallets.map((wallet) => (
            <tr
              key={wallet.address}
              className="border-b border-[#e7eaf3] hover:bg-gray-50 transition-colors"
            >
              <td className="py-3 px-4">
                <AddressLink address={wallet.address} />
              </td>
              <td className="py-3 px-4">
                <AlgorithmBadge
                  scheme={wallet.signatureScheme || schemeFromAlgorithm(wallet.algorithm)}
                  size="sm"
                />
              </td>
              <td className="py-3 px-4 text-sm text-[#6c757d]">
                {wallet.createdAt ? timeAgo(parseInt(wallet.createdAt, 10)) : "—"}
              </td>
              <td className="py-3 px-4 text-center text-[#1a1a1a]">
                {wallet.txCount}
              </td>
              <td className="py-3 px-4 text-right font-mono text-sm text-[#1a1a1a]">
                {weiToEth(wallet.ethBalance || "0")} ETH
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </div>
  );
}
