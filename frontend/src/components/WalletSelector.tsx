"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAllWallets,
  getActiveAddress,
  setActiveAddress,
  MAX_WALLETS,
  type StoredWallet,
} from "@/lib/wallet-store";
import { truncateAddress, algorithmColor, algorithmDisplayName, type AlgorithmType } from "@/lib/utils";

export default function WalletSelector() {
  const router = useRouter();
  const [wallets, setWallets] = useState<StoredWallet[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function load() {
      getAllWallets().then((ws) => {
        setWallets(ws);
        setActive(getActiveAddress());
      });
    }
    load();
    // Re-check when window gets focus (e.g. after navigating back from /create)
    window.addEventListener("focus", load);
    // Also poll every 2s to catch new wallet creation on same page
    const interval = setInterval(load, 2000);
    return () => { window.removeEventListener("focus", load); clearInterval(interval); };
  }, []);

  if (wallets.length === 0) return null;

  const current = wallets.find((w) => w.walletAddress === active) || wallets[0];

  function switchWallet(addr: string) {
    setActiveAddress(addr);
    setActive(addr);
    setOpen(false);
    router.refresh();
    window.location.reload();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1.5 transition-colors"
      >
        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#037DD6] to-[#7B61FF]" />
        <span className="text-xs font-mono text-gray-700">
          {truncateAddress(current.walletAddress)}
        </span>
        <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="p-2 space-y-1">
              {wallets.map((w) => (
                <button
                  key={w.walletAddress}
                  onClick={() => switchWallet(w.walletAddress)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                    w.walletAddress === active ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#037DD6] to-[#7B61FF] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-gray-800 truncate">{truncateAddress(w.walletAddress)}</p>
                    <span className={`${algorithmColor(w.algorithm as AlgorithmType)} text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full`}>
                      {algorithmDisplayName(w.algorithm as AlgorithmType)}
                    </span>
                  </div>
                  {w.walletAddress === active && (
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            {wallets.length < MAX_WALLETS && (
              <div className="border-t border-gray-100 p-2">
                <button
                  onClick={() => { setOpen(false); router.push("/create"); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-gray-600">Create new wallet ({wallets.length}/{MAX_WALLETS})</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
