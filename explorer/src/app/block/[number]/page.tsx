"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import TxRow from "@/components/TxRow";
import DataTable from "@/components/DataTable";
import CopyButton from "@/components/CopyButton";
import { getBlock, getTransaction, type RpcBlock, type ExplorerTransaction } from "@/lib/api";
import { hexToNumber, formatTimestamp, weiToEth } from "@/lib/utils";

export default function BlockDetailPage() {
  const params = useParams();
  const blockNumber = parseInt(params.number as string, 10);
  const [block, setBlock] = useState<RpcBlock | null>(null);
  const [transactions, setTransactions] = useState<ExplorerTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBlock() {
      if (isNaN(blockNumber)) {
        setLoading(false);
        return;
      }
      const blockData = await getBlock(blockNumber, true);
      setBlock(blockData);

      if (blockData?.transactions) {
        const txHashes = blockData.transactions.map((t) =>
          typeof t === "string" ? t : t.hash
        );
        const txPromises = txHashes.map(async (hash) => {
          const backendTx = await getTransaction(hash);
          if (backendTx) return backendTx;
          // Fallback: construct from RPC block data
          const rpcTx = typeof blockData.transactions.find(
            (t) => (typeof t === "string" ? t : t.hash) === hash
          ) === "string"
            ? null
            : (blockData.transactions.find(
                (t) => typeof t !== "string" && t.hash === hash
              ) as { hash: string; from: string; to: string; value: string; blockNumber: string; type: string } | undefined);
          return {
            hash,
            blockNumber: hexToNumber(blockData.number),
            blockHash: blockData.hash,
            from: rpcTx?.from || "",
            to: rpcTx?.to || "",
            value: rpcTx?.value || "0x0",
            gasUsed: "0",
            gasPrice: "0",
            timestamp: hexToNumber(blockData.timestamp),
            status: "0x1",
            inputData: "",
            signatureScheme: rpcTx?.type === "0x4" ? "7702" : "ecdsa",
            algorithm: -1,
            publicKey: "",
            walletAddress: "",
            txType: "Transfer",
            nonce: 0,
          } as ExplorerTransaction;
        });
        const txResults = await Promise.all(txPromises);
        setTransactions(txResults);
      }
      setLoading(false);
    }
    fetchBlock();
  }, [blockNumber]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center py-20">
          <p className="text-[#6c757d]">Loading block #{blockNumber}...</p>
        </div>
      </div>
    );
  }

  if (!block) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center py-20">
          <p className="text-[#6c757d]">Block #{blockNumber} not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1a1a1a]">Block #{blockNumber}</h1>
      </div>

      <div className="bg-white border border-[#e7eaf3] rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-[#6c757d]">Block Number</p>
            <p className="text-[#1a1a1a] font-mono">{blockNumber}</p>
          </div>
          <div>
            <p className="text-sm text-[#6c757d]">Timestamp</p>
            <p className="text-[#1a1a1a]">{formatTimestamp(block.timestamp)}</p>
          </div>
          <div className="md:col-span-2 border-t border-[#e7eaf3] pt-4">
            <p className="text-sm text-[#6c757d]">Hash</p>
            <div className="flex items-center gap-2">
              <p className="text-[#1a1a1a] font-mono text-sm break-all">{block.hash}</p>
              <CopyButton text={block.hash} />
            </div>
          </div>
          <div className="md:col-span-2 border-t border-[#e7eaf3] pt-4">
            <p className="text-sm text-[#6c757d]">Parent Hash</p>
            <div className="flex items-center gap-2">
              <p className="text-[#1a1a1a] font-mono text-sm break-all">{block.parentHash}</p>
              <CopyButton text={block.parentHash} />
            </div>
          </div>
          <div className="border-t border-[#e7eaf3] pt-4">
            <p className="text-sm text-[#6c757d]">Gas Used</p>
            <p className="text-[#1a1a1a] font-mono">{hexToNumber(block.gasUsed).toLocaleString()}</p>
          </div>
          <div className="border-t border-[#e7eaf3] pt-4">
            <p className="text-sm text-[#6c757d]">Gas Limit</p>
            <p className="text-[#1a1a1a] font-mono">{hexToNumber(block.gasLimit).toLocaleString()}</p>
          </div>
          <div className="border-t border-[#e7eaf3] pt-4">
            <p className="text-sm text-[#6c757d]">Transactions</p>
            <p className="text-[#1a1a1a]">{transactions.length}</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#e7eaf3] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e7eaf3]">
          <h2 className="text-base font-semibold text-[#1a1a1a]">Transactions in Block</h2>
        </div>
        <DataTable
          headers={["Tx Hash", "From", "To", "Value", "Block", "Scheme", "Status", "Time"]}
          isEmpty={transactions.length === 0}
          emptyMessage="No transactions in this block"
        >
          {transactions.map((tx) => (
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
