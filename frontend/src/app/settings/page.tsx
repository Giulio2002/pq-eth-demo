"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import WalletHeader from "@/components/WalletHeader";
import {
  getActiveWallet,
  getAllWallets,
  deleteWallet,
  setActiveAddress,
  type StoredWallet,
} from "@/lib/wallet-store";
import {
  truncateHex,
  truncateAddress,
  algorithmDisplayName,
  algorithmColor,
  fingerprint,
  hexToBytes,
  type AlgorithmType,
} from "@/lib/utils";

export default function SettingsPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [allWallets, setAllWallets] = useState<StoredWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function reload() {
    const ws = await getAllWallets();
    setAllWallets(ws);
    const active = await getActiveWallet();
    setWallet(active || null);
    if (!active && ws.length === 0) {
      router.push("/create");
    }
  }

  useEffect(() => {
    reload().then(() => setLoading(false));
  }, []);

  async function handleDelete(addr: string) {
    await deleteWallet(addr);
    const remaining = allWallets.filter((w) => w.walletAddress !== addr);
    if (remaining.length > 0) {
      setActiveAddress(remaining[0].walletAddress);
    }
    await reload();
    setConfirmDelete(null);
  }

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!wallet) return null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <WalletHeader
        address={wallet.walletAddress}
        algorithm={wallet.algorithm as AlgorithmType}
      />

      {/* All wallets */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Wallets ({allWallets.length}/3)</h2>

        <div className="space-y-3">
          {allWallets.map((w) => {
            const pkBytes = hexToBytes(w.publicKey);
            const isActive = w.walletAddress === wallet.walletAddress;
            return (
              <div key={w.walletAddress} className={`p-4 rounded-xl border ${isActive ? "border-blue-200 bg-blue-50" : "border-gray-200"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`${algorithmColor(w.algorithm as AlgorithmType)} text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full`}>
                      {algorithmDisplayName(w.algorithm as AlgorithmType)}
                    </span>
                    {isActive && <span className="text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Active</span>}
                  </div>
                  <span className="text-[10px] text-gray-400">{new Date(w.createdAt).toLocaleDateString()}</span>
                </div>

                <div className="flex items-center gap-1.5 mb-2">
                  <p className="text-xs font-mono text-gray-800">{w.walletAddress}</p>
                  <button onClick={() => handleCopy(w.walletAddress, w.walletAddress)} title="Copy address"
                    className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
                    {copied === w.walletAddress ? (
                      <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-3">
                  <span>Fingerprint: {fingerprint(pkBytes)}</span>
                  <button onClick={() => handleCopy(w.publicKey, "pk-" + w.walletAddress)} className="text-gray-400 hover:text-gray-600 transition-colors">
                    {copied === "pk-" + w.walletAddress ? (
                      <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    )}
                  </button>
                </div>

                <div className="flex gap-2">
                  {!isActive && (
                    <button onClick={() => { setActiveAddress(w.walletAddress); reload(); }}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">
                      Set Active
                    </button>
                  )}
                  {confirmDelete === w.walletAddress ? (
                    <div className="flex gap-1.5 flex-1">
                      <button onClick={() => handleDelete(w.walletAddress)}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors">
                        Confirm
                      </button>
                      <button onClick={() => setConfirmDelete(null)}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium transition-colors">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(w.walletAddress)}
                      className="text-xs py-1.5 px-3 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Configuration</h2>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Backend URL</p>
          <p className="text-gray-900 font-mono text-sm mt-1.5">
            {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8546"}
          </p>
        </div>
      </div>
    </div>
  );
}
