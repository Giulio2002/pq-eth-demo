"use client";

import React from "react";
import TxHashLink from "./TxHashLink";
import AddressLink from "./AddressLink";
import AlgorithmBadge from "./AlgorithmBadge";
import { weiToEth, timeAgo } from "@/lib/utils";

interface TxRowProps {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  signatureScheme: string;
  status: string;
  timestamp: number;
}

export default function TxRow({
  hash,
  from,
  to,
  value,
  blockNumber,
  signatureScheme,
  status,
  timestamp,
}: TxRowProps) {
  return (
    <tr className="border-b border-[#e7eaf3] hover:bg-gray-50 transition-colors">
      <td className="py-3 px-4">
        <TxHashLink hash={hash} />
      </td>
      <td className="py-3 px-4">
        <AddressLink address={from} />
      </td>
      <td className="py-3 px-4">
        <AddressLink address={to} />
      </td>
      <td className="py-3 px-4 text-right">
        <span className="inline-block bg-gray-100 border border-[#e7eaf3] rounded px-2 py-0.5 font-mono text-xs text-[#1a1a1a]">
          {weiToEth(value)} ETH
        </span>
      </td>
      <td className="py-3 px-4 text-center">
        <span className="text-[#6c757d] text-sm">{blockNumber}</span>
      </td>
      <td className="py-3 px-4 text-center">
        <AlgorithmBadge scheme={signatureScheme || "ecdsa"} size="sm" />
      </td>
      <td className="py-3 px-4 text-center">
        {status === "0x1" || status === "success" || status === "1" ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            Success
          </span>
        ) : status === "0x0" || status === "failed" || status === "0" ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
            Failed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-0.5">
            Pending
          </span>
        )}
      </td>
      <td className="py-3 px-4 text-right text-sm text-[#6c757d]">
        {timeAgo(timestamp)}
      </td>
    </tr>
  );
}
