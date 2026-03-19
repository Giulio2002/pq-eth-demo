"use client";

import { truncateHex } from "@/lib/utils";

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  status: string;
  type: string;
}

interface TransactionListProps {
  transactions: Transaction[];
}

export default function TransactionList({ transactions }: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Recent Transactions
        </h3>
        <p className="text-gray-400 text-sm text-center py-6">
          No transactions yet
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card">
      <h3 className="text-base font-semibold text-gray-900 mb-4">
        Recent Transactions
      </h3>
      <div className="space-y-1">
        {transactions.map((tx) => (
          <div
            key={tx.hash}
            className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  tx.type === "swap"
                    ? "bg-[#F0EDFF]"
                    : "bg-[#EAF6FF]"
                }`}
              >
                {tx.type === "swap" ? (
                  <svg className="w-4 h-4 text-[#7B61FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-[#037DD6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {tx.type === "swap" ? "Swap" : "Send"}
                </p>
                <p className="text-xs text-gray-500 font-mono">
                  {truncateHex(tx.hash, 10, 6)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900 font-mono">{tx.value} ETH</p>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  tx.status === "success"
                    ? "bg-green-50 text-green-700"
                    : tx.status === "failed"
                      ? "bg-red-50 text-red-700"
                      : "bg-yellow-50 text-yellow-700"
                }`}
              >
                {tx.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
