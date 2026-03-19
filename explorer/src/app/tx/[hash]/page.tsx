"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AddressLink from "@/components/AddressLink";
import AlgorithmBadge from "@/components/AlgorithmBadge";
import CopyButton from "@/components/CopyButton";
import {
  getTransaction,
  getRpcTransaction,
  getTransactionReceipt,
  getPoolPrice,
  type ExplorerTransaction,
} from "@/lib/api";
import { formatTimestamp, weiToEth, hexToNumber, truncateHash } from "@/lib/utils";

interface VerificationInfo {
  method: string;
  precompileAddress: string;
  gasCost: string;
  buildingBlocks?: string[];
}

function getVerificationInfo(signatureScheme: string): VerificationInfo | null {
  switch (signatureScheme) {
    case "falcon-direct":
      return {
        method: "Direct precompile (0x17)",
        precompileAddress: "0x17",
        gasCost: "~2,800",
      };
    case "falcon-ntt":
      return {
        method: "NTT Lego via FalconVerifierNTT",
        precompileAddress: "FalconVerifierNTT contract",
        gasCost: "~5,000+",
        buildingBlocks: ["NTT_FW (0x12)", "NTT_INV (0x13)", "VECMULMOD (0x14)", "SHAKE (0x16)", "LP_NORM (0x18)"],
      };
    case "dilithium-direct":
      return {
        method: "Direct precompile (0x1b)",
        precompileAddress: "0x1b",
        gasCost: "~119,000",
      };
    case "dilithium-ntt":
      return {
        method: "NTT Lego via DilithiumVerifierNTT",
        precompileAddress: "DilithiumVerifierNTT contract",
        gasCost: "~150,000+",
        buildingBlocks: [
          "NTT_FW (0x12)",
          "NTT_INV (0x13)",
          "VECMULMOD (0x14)",
          "VECADDMOD (0x15)",
          "SHAKE (0x16)",
          "EXPAND_A_VECMUL (0x1a)",
        ],
      };
    default:
      return null;
  }
}

function getTxTypeLabel(txType: string): string {
  switch (txType?.toLowerCase()) {
    case "transfer": return "Transfer";
    case "swap": return "Swap";
    case "batch": return "Batch";
    case "deploy": return "Deploy";
    case "7702-migration": return "7702-Migration";
    default: return txType || "Transfer";
  }
}

export default function TransactionDetailPage() {
  const params = useParams();
  const hash = params.hash as string;
  const [tx, setTx] = useState<ExplorerTransaction | null>(null);
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputExpanded, setInputExpanded] = useState(false);

  useEffect(() => {
    async function fetchTx() {
      // Try backend first
      const backendTx = await getTransaction(hash);
      if (backendTx) {
        setTx(backendTx);
      } else {
        // Fallback to RPC
        const [rpcTx, receipt] = await Promise.all([
          getRpcTransaction(hash),
          getTransactionReceipt(hash),
        ]);
        if (rpcTx) {
          setTx({
            hash: rpcTx.hash,
            blockNumber: hexToNumber(rpcTx.blockNumber),
            blockHash: rpcTx.blockHash,
            from: rpcTx.from,
            to: rpcTx.to || "",
            value: rpcTx.value,
            gasUsed: receipt?.gasUsed || rpcTx.gas,
            gasPrice: rpcTx.gasPrice,
            timestamp: 0,
            status: receipt?.status || "0x1",
            inputData: rpcTx.input,
            signatureScheme: rpcTx.type === "0x4" ? "7702" : "ecdsa",
            algorithm: -1,
            publicKey: "",
            walletAddress: "",
            txType: rpcTx.type === "0x4" ? "7702-Migration" : "Transfer",
            nonce: hexToNumber(rpcTx.nonce),
          });
        }
      }

      const price = await getPoolPrice();
      setEthPrice(price);
      setLoading(false);
    }
    fetchTx();
  }, [hash]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center py-20">
          <p className="text-[#6c757d]">Loading transaction...</p>
        </div>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center py-20">
          <p className="text-[#6c757d]">Transaction not found: {truncateHash(hash)}</p>
        </div>
      </div>
    );
  }

  const verificationInfo = getVerificationInfo(tx.signatureScheme);
  const ethValue = weiToEth(tx.value);
  const ethFloat = parseFloat(ethValue);
  const usdValue = ethPrice ? (ethFloat * ethPrice).toFixed(2) : null;
  const isPq = verificationInfo !== null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1a1a1a]">Transaction Details</h1>
      </div>

      <div className="bg-white border border-[#e7eaf3] rounded-lg p-6 space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <div className="flex items-start justify-between border-b border-[#e7eaf3] pb-4">
            <div>
              <p className="text-sm text-[#6c757d] mb-1">Transaction Hash</p>
              <div className="flex items-center gap-2">
                <p className="text-[#1a1a1a] font-mono text-sm break-all">{tx.hash}</p>
                <CopyButton text={tx.hash} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-[#6c757d] mb-1">Status</p>
              {tx.status === "0x1" || tx.status === "success" || tx.status === "1" ? (
                <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-0.5 text-sm font-medium">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Success
                </span>
              ) : (
                <span className="inline-flex items-center text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-0.5 text-sm font-medium">
                  Failed
                </span>
              )}
            </div>
            <div>
              <p className="text-sm text-[#6c757d] mb-1">Block</p>
              <a
                href={`/block/${tx.blockNumber}`}
                className="text-[#0784C3] hover:text-blue-800 hover:underline"
              >
                {tx.blockNumber}
              </a>
            </div>
            <div>
              <p className="text-sm text-[#6c757d] mb-1">Timestamp</p>
              <p className="text-[#1a1a1a]">{tx.timestamp ? formatTimestamp(tx.timestamp) : "—"}</p>
            </div>
            <div>
              <p className="text-sm text-[#6c757d] mb-1">Transaction Type</p>
              <p className="text-[#1a1a1a]">{getTxTypeLabel(tx.txType)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[#e7eaf3] pt-4">
            <div>
              <p className="text-sm text-[#6c757d] mb-1">From</p>
              <AddressLink address={tx.from} truncate={false} />
            </div>
            <div>
              <p className="text-sm text-[#6c757d] mb-1">To</p>
              <AddressLink address={tx.to} truncate={false} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-[#e7eaf3] pt-4">
            <div>
              <p className="text-sm text-[#6c757d] mb-1">Value</p>
              <p className="text-[#1a1a1a] font-mono">
                {ethValue} ETH
                {usdValue && (
                  <span className="text-[#6c757d] text-sm ml-2">(${usdValue})</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-[#6c757d] mb-1">Gas Used</p>
              <p className="text-[#1a1a1a] font-mono">
                {tx.gasUsed ? Number(tx.gasUsed).toLocaleString() : "—"}
              </p>
            </div>
            <div>
              <p className="text-sm text-[#6c757d] mb-1">Gas Price</p>
              <p className="text-[#1a1a1a] font-mono">
                {tx.gasPrice ? Number(tx.gasPrice).toLocaleString() : "—"} wei
              </p>
            </div>
          </div>

          {/* Input Data */}
          {tx.inputData && tx.inputData !== "0x" && (
            <div className="border-t border-[#e7eaf3] pt-4">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-[#6c757d]">Input Data</p>
                <button
                  onClick={() => setInputExpanded(!inputExpanded)}
                  className="text-xs text-[#0784C3] hover:text-blue-800"
                >
                  {inputExpanded ? "Collapse" : "Expand"}
                </button>
              </div>
              <div
                className={`bg-[#F8F9FA] border border-[#e7eaf3] rounded p-3 font-mono text-xs text-[#1a1a1a] ${
                  inputExpanded ? "" : "max-h-20 overflow-hidden"
                }`}
              >
                <p className="break-all">{tx.inputData}</p>
              </div>
              {!inputExpanded && tx.inputData.length > 200 && (
                <p className="text-xs text-[#6c757d] mt-1">{tx.inputData.length} characters</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Signature Scheme Section */}
      <div className="bg-white border border-[#e7eaf3] rounded-lg p-6">
        <h2 className="text-base font-semibold text-[#1a1a1a] mb-4">Signature Scheme</h2>
        <div className="flex items-center gap-3 mb-4">
          <AlgorithmBadge scheme={tx.signatureScheme || "ecdsa"} size="lg" />
        </div>

        {isPq && verificationInfo ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-[#6c757d] mb-1">Algorithm</p>
                <p className="text-[#1a1a1a]">
                  {tx.signatureScheme?.includes("falcon") ? "Falcon-512" : "Dilithium-2 (Dilithium)"}
                </p>
              </div>
              <div>
                <p className="text-sm text-[#6c757d] mb-1">Verification Approach</p>
                <p className="text-[#1a1a1a]">
                  {tx.signatureScheme?.includes("ntt") ? "NTT / Lego (composite precompiles)" : "Direct (single precompile)"}
                </p>
              </div>
              <div>
                <p className="text-sm text-[#6c757d] mb-1">Verification Method</p>
                <p className="text-[#1a1a1a] font-mono text-sm">{verificationInfo.method}</p>
              </div>
              <div>
                <p className="text-sm text-[#6c757d] mb-1">Precompile / Verifier Address</p>
                <p className="text-[#1a1a1a] font-mono text-sm">{verificationInfo.precompileAddress}</p>
              </div>
            </div>

            {tx.publicKey && (
              <div className="border-t border-[#e7eaf3] pt-4">
                <p className="text-sm text-[#6c757d] mb-1">Public Key</p>
                <div className="flex items-center gap-2">
                  <p className="text-[#1a1a1a] font-mono text-xs break-all bg-[#F8F9FA] border border-[#e7eaf3] rounded p-2 flex-1">
                    {tx.publicKey}
                  </p>
                  <CopyButton text={tx.publicKey} />
                </div>
              </div>
            )}

            {verificationInfo.buildingBlocks && (
              <div className="border-t border-[#e7eaf3] pt-4">
                <p className="text-sm text-[#6c757d] mb-2">Building-Block Precompiles Used</p>
                <div className="flex flex-wrap gap-2">
                  {verificationInfo.buildingBlocks.map((block) => (
                    <span
                      key={block}
                      className="inline-flex items-center px-2 py-1 text-xs font-mono bg-[#F8F9FA] border border-[#e7eaf3] text-[#1a1a1a] rounded"
                    >
                      {block}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-[#6c757d]">
              {tx.signatureScheme === "7702"
                ? "This is an EIP-7702 delegation transaction for migrating an EOA to post-quantum security."
                : "Standard ECDSA signature — not a post-quantum wallet transaction."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
