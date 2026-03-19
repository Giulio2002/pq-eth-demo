"use client";

import React from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";

interface BlockRowProps {
  number: number;
  timestamp: number;
  txCount: number;
  pqTxCount: number;
}

export default function BlockRow({ number, timestamp, txCount, pqTxCount }: BlockRowProps) {
  return (
    <tr className="border-b border-[#e7eaf3] hover:bg-gray-50 transition-colors">
      <td className="py-3 px-4">
        <Link
          href={`/block/${number}`}
          className="text-[#0784C3] hover:text-blue-800 hover:underline font-mono text-sm"
        >
          {number}
        </Link>
      </td>
      <td className="py-3 px-4 text-sm text-[#6c757d]">
        {timeAgo(timestamp)}
      </td>
      <td className="py-3 px-4 text-center text-[#1a1a1a]">
        {txCount}
      </td>
      <td className="py-3 px-4 text-center">
        {pqTxCount > 0 ? (
          <span className="text-purple-700 font-medium bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5 text-xs">
            {pqTxCount}
          </span>
        ) : (
          <span className="text-[#6c757d]">0</span>
        )}
      </td>
    </tr>
  );
}
