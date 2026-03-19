"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import WalletHeader from "@/components/WalletHeader";
import {
  getPrimaryWallet,
  deleteWallet,
  type StoredWallet,
} from "@/lib/wallet-store";
import {
  truncateHex,
  algorithmDisplayName,
  fingerprint,
  hexToBytes,
  type AlgorithmType,
} from "@/lib/utils";

export default function SettingsPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getPrimaryWallet().then((w) => {
      if (!w) {
        router.push("/create");
      } else {
        setWallet(w);
        setLoading(false);
      }
    });
  }, [router]);

  async function handleDelete() {
    if (!wallet || !confirmDelete) return;
    await deleteWallet(wallet.walletAddress);
    router.push("/create");
  }

  async function handleCopyPublicKey() {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet.publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!wallet) return null;

  const pkBytes = hexToBytes(wallet.publicKey);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <WalletHeader
        address={wallet.walletAddress}
        algorithm={wallet.algorithm as AlgorithmType}
      />

      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Wallet Info</h2>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Wallet Address</p>
            <p className="text-gray-900 font-mono text-sm mt-1.5">
              {wallet.walletAddress}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Algorithm</p>
            <p className="text-gray-900 mt-1.5 font-medium">
              {algorithmDisplayName(wallet.algorithm as AlgorithmType)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Public Key Fingerprint</p>
            <p className="text-gray-900 font-mono text-sm mt-1.5">
              {fingerprint(pkBytes)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Public Key</p>
            <div className="flex items-center gap-2 mt-1.5">
              <p className="text-gray-900 font-mono text-xs break-all flex-1">
                {truncateHex(wallet.publicKey, 16, 8)}
              </p>
              <button
                onClick={handleCopyPublicKey}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap font-medium border border-gray-200"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Created</p>
            <p className="text-gray-900 text-sm mt-1.5">
              {new Date(wallet.createdAt).toLocaleString()}
            </p>
          </div>
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

      <div className="bg-white rounded-2xl p-6 border border-red-200 shadow-card space-y-4">
        <h2 className="text-lg font-semibold text-red-600">Danger Zone</h2>
        <p className="text-gray-600 text-sm">
          Deleting your wallet will remove the private key from your browser.
          Make sure you have a backup if needed. This action cannot be undone.
        </p>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full py-3 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 font-semibold transition-colors"
          >
            Delete Wallet
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-red-700 text-sm font-semibold">
              Are you sure? This will permanently delete your wallet from this
              browser.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-colors border border-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
