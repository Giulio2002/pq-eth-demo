"use client";

import { useState } from "react";
import { AlgorithmType, algorithmDisplayName, algorithmColor, truncateAddress } from "@/lib/utils";

interface WalletHeaderProps {
  address: string;
  algorithm: AlgorithmType;
  balance?: string;
}

export default function WalletHeader({ address, algorithm, balance }: WalletHeaderProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card">
      {/* Account pill */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#037DD6] to-[#7B61FF]" />
          <span className="text-sm font-mono text-gray-700" title={address}>
            {truncateAddress(address)}
          </span>
          <button onClick={handleCopy} className="text-gray-400 hover:text-gray-600 transition-colors" title="Copy address">
            {copied ? (
              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
          <span
            className={`${algorithmColor(algorithm)} text-white text-xs font-medium px-2 py-0.5 rounded-full`}
          >
            {algorithmDisplayName(algorithm)}
          </span>
        </div>
      </div>

      {/* Balance display */}
      {balance && (
        <div className="text-center">
          <p className="text-4xl font-bold text-gray-900 tracking-tight">
            {balance}
            <span className="text-lg font-medium text-gray-500 ml-2">ETH</span>
          </p>
        </div>
      )}
    </div>
  );
}
