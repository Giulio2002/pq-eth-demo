"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import WalletHeader from "@/components/WalletHeader";
import AmountInput from "@/components/AmountInput";
import { getPrimaryWallet, type StoredWallet } from "@/lib/wallet-store";
import {
  getSwapMessage,
  swap as apiSwap,
  getPoolPrice,
  getAssets,
} from "@/lib/api";
import { initPQ, sign } from "@/lib/pq";
import {
  hexToBytes,
  bytesToHex,
  ethToWei,
  weiToEth,
  formatUsd,
  type AlgorithmType,
} from "@/lib/utils";

type Direction = "eth-to-usd" | "usd-to-eth";

export default function SwapPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState<Direction>("eth-to-usd");
  const [amountIn, setAmountIn] = useState("");
  const [ethPrice, setEthPrice] = useState(2000);
  const [balance, setBalance] = useState("0.0000");
  const [usdBalance, setUsdBalance] = useState("0.00");
  const [swapping, setSwapping] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPrimaryWallet().then((w) => {
      if (!w) {
        router.push("/create");
      } else {
        setWallet(w);
        setLoading(false);
      }
    });
    initPQ().catch(() => {});
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!wallet) return;
    try {
      const [p, a] = await Promise.allSettled([
        getPoolPrice(),
        getAssets(wallet.walletAddress),
      ]);
      if (p.status === "fulfilled") setEthPrice(p.value.ethUsd);
      if (a.status === "fulfilled") {
        setBalance(weiToEth(a.value.eth));
        setUsdBalance(weiToEth(a.value.usd));
      }
    } catch {
      // Backend may not be running
    }
  }, [wallet]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const estimatedOutput =
    amountIn && parseFloat(amountIn) > 0
      ? direction === "eth-to-usd"
        ? (parseFloat(amountIn) * ethPrice).toFixed(2)
        : (parseFloat(amountIn) / ethPrice).toFixed(6)
      : "";

  const minAmountOut = estimatedOutput
    ? direction === "eth-to-usd"
      ? (parseFloat(estimatedOutput) * 0.95).toFixed(2)
      : (parseFloat(estimatedOutput) * 0.95).toFixed(6)
    : "0";

  async function handleSwap() {
    if (!wallet || !amountIn) return;
    setSwapping(true);
    setError(null);
    setTxHash(null);

    try {
      const weiAmountIn = ethToWei(amountIn);
      const weiMinOut = ethToWei(minAmountOut);

      // Step 1: Get message hash from backend
      const { messageHash } = await getSwapMessage(
        wallet.walletAddress,
        direction,
        weiAmountIn,
        weiMinOut
      );

      // Step 2: Sign message hash with PQ private key (browser-only)
      const msgBytes = hexToBytes(messageHash);
      const skBytes = hexToBytes(wallet.secretKey);
      const signature = sign(
        wallet.algorithm as AlgorithmType,
        skBytes,
        msgBytes
      );

      // Step 3: Send signed swap via backend
      const result = await apiSwap(
        wallet.walletAddress,
        direction,
        weiAmountIn,
        weiMinOut,
        bytesToHex(signature)
      );

      setTxHash(result.txHash);
      setAmountIn("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwapping(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!wallet) return null;

  const inputToken = direction === "eth-to-usd" ? "ETH" : "USD";
  const outputToken = direction === "eth-to-usd" ? "USD" : "ETH";

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <WalletHeader
        address={wallet.walletAddress}
        algorithm={wallet.algorithm as AlgorithmType}
        balance={balance}
      />

      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Swap</h2>
          <div className="flex bg-gray-100 rounded-xl overflow-hidden p-0.5">
            <button
              onClick={() => setDirection("eth-to-usd")}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                direction === "eth-to-usd"
                  ? "bg-[#037DD6] text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              ETH &rarr; USD
            </button>
            <button
              onClick={() => setDirection("usd-to-eth")}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                direction === "usd-to-eth"
                  ? "bg-[#7B61FF] text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              USD &rarr; ETH
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-500">
          Balance: {direction === "eth-to-usd" ? `${balance} ETH` : `${usdBalance} USD`}
        </div>

        <AmountInput
          label={`You pay (${inputToken})`}
          value={amountIn}
          onChange={setAmountIn}
          token={inputToken}
          usdEquivalent={
            direction === "eth-to-usd" && amountIn
              ? formatUsd(parseFloat(amountIn) * ethPrice)
              : undefined
          }
        />

        <div className="flex justify-center">
          <div className="w-9 h-9 bg-gray-100 border border-gray-200 rounded-full flex items-center justify-center text-gray-400 text-sm">
            &darr;
          </div>
        </div>

        <AmountInput
          label={`You receive (estimated, ${outputToken})`}
          value={estimatedOutput}
          onChange={() => {}}
          token={outputToken}
          disabled
        />

        <div className="text-xs text-gray-500 space-y-1.5 bg-gray-50 rounded-xl p-3">
          <div className="flex justify-between">
            <span>Rate</span>
            <span className="font-medium text-gray-700">1 ETH = {formatUsd(ethPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span>Min. received (5% slippage)</span>
            <span className="font-medium text-gray-700">
              {minAmountOut} {outputToken}
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {txHash && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-green-800 text-sm font-semibold mb-2">
              Swap submitted!
            </p>
            <p className="text-green-700 text-xs font-mono break-all">
              {txHash}
            </p>
            <a
              href={`http://localhost:3001/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-[#037DD6] hover:underline"
            >
              View in Explorer &rarr;
            </a>
          </div>
        )}

        <button
          onClick={handleSwap}
          disabled={swapping || !amountIn}
          className={`w-full py-3 rounded-xl font-semibold transition-colors text-white ${
            direction === "eth-to-usd"
              ? "bg-[#037DD6] hover:bg-[#0260A4]"
              : "bg-[#7B61FF] hover:bg-[#6349D6]"
          } disabled:bg-gray-200 disabled:text-gray-400`}
        >
          {swapping ? "Signing & swapping..." : `Swap ${inputToken} for ${outputToken}`}
        </button>
      </div>
    </div>
  );
}
