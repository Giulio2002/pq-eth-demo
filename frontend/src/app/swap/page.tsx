"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import WalletHeader from "@/components/WalletHeader";
import AmountInput from "@/components/AmountInput";
import { getPrimaryWallet, type StoredWallet } from "@/lib/wallet-store";
import {
  getSwapMessage,
  swap as apiSwap,
  getAssets,
} from "@/lib/api";
import { initPQ, sign, deriveEphemeralKey, deriveEphemeralAddress, ecdsaSignWithRotation } from "@/lib/pq";
import { saveWallet } from "@/lib/wallet-store";
import {
  hexToBytes,
  bytesToHex,
  ethToWei,
  weiToEth,
  formatUsd,
  isEphemeralECDSA,
  type AlgorithmType,
} from "@/lib/utils";

type Direction = "eth_to_usd" | "usd_to_eth" | "eth_to_jedkh" | "jedkh_to_eth";

const PAIRS: { id: Direction; label: string; color: string }[] = [
  { id: "eth_to_usd", label: "ETH \u2192 USD", color: "bg-blue-700" },
  { id: "usd_to_eth", label: "USD \u2192 ETH", color: "bg-violet-700" },
  { id: "eth_to_jedkh", label: "ETH \u2192 JEDKH", color: "bg-amber-800" },
  { id: "jedkh_to_eth", label: "JEDKH \u2192 ETH", color: "bg-amber-800" },
];

function inTok(d: Direction) { return d.startsWith("eth") ? "ETH" : d.startsWith("usd") ? "USD" : "JEDKH"; }
function outTok(d: Direction) { return d.endsWith("usd") ? "USD" : d.endsWith("eth") ? "ETH" : "JEDKH"; }

export default function SwapPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState<Direction>("eth_to_usd");
  const [amountIn, setAmountIn] = useState("");
  const ethPrice = 2000;
  const jedkhEth = 0.5;
  const [balance, setBalance] = useState("0.0000");
  const [usdBalance, setUsdBalance] = useState("0.00");
  const [jedkhBalance, setJedkhBalance] = useState("0.0000");
  const [swapping, setSwapping] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPrimaryWallet().then((w) => {
      if (!w) { router.push("/create"); } else { setWallet(w); setLoading(false); }
    });
    initPQ().catch(() => {});
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!wallet) return;
    try {
      const a = await getAssets(wallet.walletAddress);
      setBalance(weiToEth(a.eth));
      setUsdBalance(weiToEth(a.usd));
      if (a.jedkh) setJedkhBalance(weiToEth(a.jedkh));
    } catch {}
  }, [wallet]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  function estimate(): string {
    if (!amountIn || parseFloat(amountIn) <= 0) return "";
    const a = parseFloat(amountIn);
    switch (direction) {
      case "eth_to_usd": return (a * ethPrice).toFixed(2);
      case "usd_to_eth": return (a / ethPrice).toFixed(6);
      case "eth_to_jedkh": return (a / jedkhEth).toFixed(4);
      case "jedkh_to_eth": return (a * jedkhEth).toFixed(6);
    }
  }

  const estimated = estimate();
  const minOut = estimated ? (parseFloat(estimated) * 0.95).toFixed(6) : "0";
  const iT = inTok(direction);
  const oT = outTok(direction);

  function curBal() {
    if (iT === "ETH") return `${balance} ETH`;
    if (iT === "USD") return `${usdBalance} USD`;
    return `${jedkhBalance} JEDKH`;
  }

  async function handleSwap() {
    if (!wallet || !amountIn) return;
    setSwapping(true); setError(null); setTxHash(null);
    try {
      const weiIn = ethToWei(amountIn);
      const weiMin = ethToWei(minOut);
      const algo = wallet.algorithm as AlgorithmType;

      let signature: Uint8Array;
      if (isEphemeralECDSA(algo)) {
        const seed = hexToBytes(wallet.secretKey);
        const idx = wallet.ephemeralIndex ?? 0;
        const currentKey = deriveEphemeralKey(seed, idx);
        const nextAddr = deriveEphemeralAddress(seed, idx + 1);
        const nsh = bytesToHex(nextAddr);
        const { messageHash } = await getSwapMessage(wallet.walletAddress, direction, weiIn, weiMin, nsh);
        signature = ecdsaSignWithRotation(currentKey, hexToBytes(messageHash), nextAddr);
        const updated = { ...wallet, ephemeralIndex: idx + 1 };
        await saveWallet(updated);
        setWallet(updated);
      } else {
        const { messageHash } = await getSwapMessage(wallet.walletAddress, direction, weiIn, weiMin);
        signature = sign(algo, hexToBytes(wallet.secretKey), hexToBytes(messageHash));
      }

      const result = await apiSwap(wallet.walletAddress, direction, weiIn, weiMin, bytesToHex(signature));
      setTxHash(result.txHash);
      setAmountIn("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwapping(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-gray-400 text-sm">Loading...</div></div>;
  if (!wallet) return null;

  const pair = PAIRS.find((p) => p.id === direction)!;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <WalletHeader address={wallet.walletAddress} algorithm={wallet.algorithm as AlgorithmType} balance={balance} />

      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Swap</h2>

        <div className="flex flex-wrap gap-1.5">
          {PAIRS.map((p) => (
            <button key={p.id}
              onClick={() => { setDirection(p.id); setAmountIn(""); setTxHash(null); setError(null); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${direction === p.id ? `${p.color} text-white shadow-sm` : "bg-gray-100 text-gray-600 hover:text-gray-800"}`}
            >{p.label}</button>
          ))}
        </div>

        <div className="text-xs text-gray-500">Balance: {curBal()}</div>

        <AmountInput label={`You pay (${iT})`} value={amountIn} onChange={setAmountIn} token={iT}
          usdEquivalent={iT === "ETH" && amountIn ? formatUsd(parseFloat(amountIn) * ethPrice) : iT === "JEDKH" && amountIn ? formatUsd(parseFloat(amountIn) * jedkhEth * ethPrice) : undefined} />

        <div className="flex justify-center">
          <div className="w-9 h-9 bg-gray-100 border border-gray-200 rounded-full flex items-center justify-center text-gray-400 text-sm">&darr;</div>
        </div>

        <AmountInput label={`You receive (est. ${oT})`} value={estimated} onChange={() => {}} token={oT} disabled />

        <div className="text-xs text-gray-500 space-y-1.5 bg-gray-50 rounded-xl p-3">
          <div className="flex justify-between">
            <span>Rate</span>
            <span className="font-medium text-gray-700">{direction.includes("jedkh") ? "1 JEDKH = 0.5 ETH" : `1 ETH = ${formatUsd(ethPrice)}`}</span>
          </div>
          <div className="flex justify-between">
            <span>Min. received (5% slippage)</span>
            <span className="font-medium text-gray-700">{minOut} {oT}</span>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>}

        {txHash && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-green-800 text-sm font-semibold mb-2">Swap submitted!</p>
            <p className="text-green-700 text-xs font-mono break-all">{txHash}</p>
            <a href={`http://localhost:3001/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-blue-700 hover:underline">View in Explorer &rarr;</a>
          </div>
        )}

        <button onClick={handleSwap} disabled={swapping || !amountIn}
          className={`w-full py-3 rounded-xl font-semibold transition-colors text-white ${pair.color} hover:opacity-90 disabled:bg-gray-200 disabled:text-gray-400`}>
          {swapping ? "Signing & swapping..." : `Swap ${iT} for ${oT}`}
        </button>
      </div>
    </div>
  );
}
