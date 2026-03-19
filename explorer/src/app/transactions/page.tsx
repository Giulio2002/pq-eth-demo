"use client";

import React, { useEffect, useState, useCallback } from "react";
import TxRow from "@/components/TxRow";
import DataTable from "@/components/DataTable";
import { getRecentTransactions, type ExplorerTransaction } from "@/lib/api";

const PAGE_SIZE = 25;

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<ExplorerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchTransactions = useCallback(async () => {
    const txs = await getRecentTransactions(200);
    // Sort by timestamp descending (most recent first)
    const sorted = [...txs].sort((a, b) => b.timestamp - a.timestamp);
    setTransactions(sorted);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTransactions();
    const interval = setInterval(fetchTransactions, 10000);
    return () => clearInterval(interval);
  }, [fetchTransactions]);

  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const pageTxs = transactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1a1a1a]">Transactions</h1>
        <p className="text-[#6c757d] text-sm mt-1">
          All transactions on the PQ-ETH devnet
          {transactions.length > 0 && (
            <span className="ml-2 text-[#6c757d]">({transactions.length} total)</span>
          )}
        </p>
      </div>

      <div className="bg-white border border-[#e7eaf3] rounded-lg overflow-hidden">
        <DataTable
          headers={["Tx Hash", "From", "To", "Value", "Block", "Scheme", "Status", "Time"]}
          isEmpty={pageTxs.length === 0}
          emptyMessage={loading ? "Loading transactions..." : "No transactions found"}
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
        >
          {pageTxs.map((tx) => (
            <TxRow
              key={tx.hash}
              hash={tx.hash}
              from={tx.from}
              to={tx.to}
              value={tx.value}
              blockNumber={tx.blockNumber}
              signatureScheme={tx.signatureScheme || "ecdsa"}
              status={tx.status}
              timestamp={tx.timestamp}
            />
          ))}
        </DataTable>
      </div>
    </div>
  );
}
