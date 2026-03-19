"use client";

import { AlgorithmType, algorithmDisplayName, algorithmColor, truncateAddress } from "@/lib/utils";

interface WalletHeaderProps {
  address: string;
  algorithm: AlgorithmType;
  balance?: string;
}

export default function WalletHeader({ address, algorithm, balance }: WalletHeaderProps) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card">
      {/* Account pill */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#037DD6] to-[#7B61FF]" />
          <span className="text-sm font-mono text-gray-700" title={address}>
            {truncateAddress(address)}
          </span>
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
