"use client";

import React, { useEffect, useState, useCallback } from "react";
import BlockRow from "@/components/BlockRow";
import DataTable from "@/components/DataTable";
import { getRecentBlocks, getBlock, type ExplorerBlock } from "@/lib/api";
import { hexToNumber } from "@/lib/utils";

const PAGE_SIZE = 20;

export default function BlocksPage() {
  const [blocks, setBlocks] = useState<ExplorerBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchBlocks = useCallback(async () => {
    // Try backend first
    const backendBlocks = await getRecentBlocks(100);
    if (backendBlocks.length > 0) {
      setBlocks(backendBlocks);
      setLoading(false);
      return;
    }

    // Fallback to RPC
    const latestBlock = await getBlock("latest");
    if (!latestBlock) {
      setLoading(false);
      return;
    }
    const latestNum = hexToNumber(latestBlock.number);
    const blockPromises: Promise<ExplorerBlock | null>[] = [];
    for (let i = latestNum; i >= Math.max(0, latestNum - 99); i--) {
      blockPromises.push(
        getBlock(i).then((b) =>
          b
            ? {
                number: hexToNumber(b.number),
                hash: b.hash,
                parentHash: b.parentHash,
                timestamp: hexToNumber(b.timestamp),
                gasUsed: b.gasUsed,
                gasLimit: b.gasLimit,
                txCount: Array.isArray(b.transactions) ? b.transactions.length : 0,
                pqTxCount: 0,
              }
            : null
        )
      );
    }
    const results = (await Promise.all(blockPromises)).filter(
      (b): b is ExplorerBlock => b !== null
    );
    setBlocks(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBlocks();
    const interval = setInterval(fetchBlocks, 10000);
    return () => clearInterval(interval);
  }, [fetchBlocks]);

  const totalPages = Math.max(1, Math.ceil(blocks.length / PAGE_SIZE));
  const pageBlocks = blocks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1a1a1a]">Blocks</h1>
        <p className="text-[#6c757d] text-sm mt-1">All blocks on the PQ-ETH devnet</p>
      </div>

      <div className="bg-white border border-[#e7eaf3] rounded-lg overflow-hidden">
        <DataTable
          headers={["Block", "Time", "Transactions", "PQ Transactions"]}
          isEmpty={pageBlocks.length === 0}
          emptyMessage={loading ? "Loading blocks..." : "No blocks found"}
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
        >
          {pageBlocks.map((block) => (
            <BlockRow
              key={block.number}
              number={block.number}
              timestamp={block.timestamp}
              txCount={block.txCount}
              pqTxCount={block.pqTxCount}
            />
          ))}
        </DataTable>
      </div>
    </div>
  );
}
