"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AlgorithmBadge from "@/components/AlgorithmBadge";
import TxRow from "@/components/TxRow";
import DataTable from "@/components/DataTable";
import CopyButton from "@/components/CopyButton";
import TxHashLink from "@/components/TxHashLink";
import {
  getAddress,
  getBalance,
  getPoolPrice,
  type ExplorerAddress,
} from "@/lib/api";
import { weiToEth, schemeFromAlgorithm } from "@/lib/utils";

export default function AddressDetailPage() {
  const params = useParams();
  const address = params.address as string;
  const [data, setData] = useState<ExplorerAddress | null>(null);
  const [ethBalance, setEthBalance] = useState<string>("0x0");
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const [addrData, balance, price] = await Promise.all([
        getAddress(address),
        getBalance(address),
        getPoolPrice(),
      ]);
      setData(addrData);
      setEthBalance(balance);
      setEthPrice(price);
      setLoading(false);
    }
    fetchData();
  }, [address]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center py-20">
          <p className="text-[#6c757d]">Loading address...</p>
        </div>
      </div>
    );
  }

  const isPqWallet = data?.isPqWallet ?? false;
  const wallet = data?.wallet;
  const ethVal = weiToEth(data?.ethBalance || ethBalance);
  const ethFloat = parseFloat(ethVal);
  const usdEquiv = ethPrice ? (ethFloat * ethPrice).toFixed(2) : null;
  const transactions = data?.transactions || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1a1a1a]">Address</h1>
      </div>

      <div className="bg-white border border-[#e7eaf3] rounded-lg p-6 space-y-4">
        <div>
          <p className="text-sm text-[#6c757d] mb-1">Address</p>
          <div className="flex items-center gap-2">
            <p className="text-[#1a1a1a] font-mono text-sm break-all">{address}</p>
            <CopyButton text={address} />
          </div>
        </div>

        {isPqWallet && wallet && (
          <>
            <div className="flex items-center gap-3 pt-2 border-t border-[#e7eaf3]">
              <AlgorithmBadge scheme={wallet.signatureScheme || schemeFromAlgorithm(wallet.algorithm)} size="lg" />
              {wallet.is7702 && (
                <span className="inline-flex items-center px-2 py-1 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-full font-medium">
                  7702-Migrated EOA
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-[#6c757d] mb-1">Wallet Nonce</p>
                <p className="text-[#1a1a1a]">{wallet.nonce}</p>
              </div>
              <div>
                <p className="text-sm text-[#6c757d] mb-1">Payer Address</p>
                <p className="text-[#1a1a1a] font-mono text-sm">{wallet.payer || "—"}</p>
              </div>
              {wallet.creationTxHash && (
                <div>
                  <p className="text-sm text-[#6c757d] mb-1">Creation Transaction</p>
                  <TxHashLink hash={wallet.creationTxHash} />
                </div>
              )}
            </div>

            {wallet.publicKey && (
              <div className="border-t border-[#e7eaf3] pt-4">
                <p className="text-sm text-[#6c757d] mb-1">Public Key</p>
                <div className="flex items-start gap-2">
                  <p className="text-[#1a1a1a] font-mono text-xs break-all bg-[#F8F9FA] border border-[#e7eaf3] rounded p-3 flex-1 max-h-32 overflow-y-auto">
                    {wallet.publicKey}
                  </p>
                  <CopyButton text={wallet.publicKey} />
                </div>
              </div>
            )}
          </>
        )}

        {!isPqWallet && (
          <p className="text-[#6c757d] text-sm">This is a standard Ethereum address (not a PQ wallet).</p>
        )}
      </div>

      {/* Balances */}
      <div className="bg-white border border-[#e7eaf3] rounded-lg p-6">
        <h2 className="text-base font-semibold text-[#1a1a1a] mb-4">Balances</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-[#6c757d] mb-1">ETH</p>
            <p className="text-[#1a1a1a] font-mono text-lg">{ethVal} ETH</p>
            {usdEquiv && <p className="text-[#6c757d] text-sm">${usdEquiv}</p>}
          </div>
          {data?.wethBalance && (
            <div>
              <p className="text-sm text-[#6c757d] mb-1">WETH</p>
              <p className="text-[#1a1a1a] font-mono">{weiToEth(data.wethBalance)} WETH</p>
            </div>
          )}
          {data?.usdBalance && (
            <div>
              <p className="text-sm text-[#6c757d] mb-1">USD</p>
              <p className="text-[#1a1a1a] font-mono">{weiToEth(data.usdBalance)} USD</p>
            </div>
          )}
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-white border border-[#e7eaf3] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e7eaf3]">
          <h2 className="text-base font-semibold text-[#1a1a1a]">
            Transactions
            {data?.txCount !== undefined && (
              <span className="text-[#6c757d] text-sm ml-2">({data.txCount} total)</span>
            )}
          </h2>
        </div>
        <DataTable
          headers={["Tx Hash", "From", "To", "Value", "Block", "Scheme", "Status", "Time"]}
          isEmpty={transactions.length === 0}
          emptyMessage="No transactions found for this address"
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
