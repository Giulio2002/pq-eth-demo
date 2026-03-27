"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import WalletHeader from "@/components/WalletHeader";
import AmountInput from "@/components/AmountInput";
import { getPrimaryWallet, type StoredWallet } from "@/lib/wallet-store";
import { getExecuteMessage, execute, getPoolPrice, getAssets } from "@/lib/api";
import { initPQ, sign, generateECDSAKeypair, ecdsaSignWithRotation, ecdsaPrivKeyToAddress } from "@/lib/pq";
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

export default function SendPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [ethPrice, setEthPrice] = useState(2000);
  const [balance, setBalance] = useState("0.0000");
  const [sending, setSending] = useState(false);
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
      if (a.status === "fulfilled") setBalance(weiToEth(a.value.eth));
    } catch {
      // Backend may not be running
    }
  }, [wallet]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  async function handleSend() {
    if (!wallet || !recipient || !amount) return;
    setSending(true);
    setError(null);
    setTxHash(null);

    try {
      const weiValue = ethToWei(amount);
      const algo = wallet.algorithm as AlgorithmType;

      let signature: Uint8Array;

      if (isEphemeralECDSA(algo)) {
        // Ephemeral ECDSA: generate next key, include in hash, sign, rotate
        const nextKey = generateECDSAKeypair();
        const nextSignerHex = bytesToHex(nextKey.publicKey);

        const { messageHash } = await getExecuteMessage(
          wallet.walletAddress, recipient, weiValue, "0x", nextSignerHex
        );

        const msgBytes = hexToBytes(messageHash);
        const skBytes = hexToBytes(wallet.secretKey);
        signature = ecdsaSignWithRotation(skBytes, msgBytes, nextKey.publicKey);

        // Rotate: update stored wallet with next key
        await saveWallet({
          ...wallet,
          secretKey: bytesToHex(nextKey.secretKey),
          publicKey: nextSignerHex,
        });
        setWallet({ ...wallet, secretKey: bytesToHex(nextKey.secretKey), publicKey: nextSignerHex });
      } else {
        const { messageHash } = await getExecuteMessage(
          wallet.walletAddress, recipient, weiValue, "0x"
        );
        const msgBytes = hexToBytes(messageHash);
        const skBytes = hexToBytes(wallet.secretKey);
        signature = sign(algo, skBytes, msgBytes);
      }

      // Send signed transaction via backend
      const result = await execute(
        wallet.walletAddress,
        recipient,
        weiValue,
        "0x",
        bytesToHex(signature)
      );

      setTxHash(result.txHash);
      setAmount("");
      setRecipient("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
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

  const usdEquivalent = amount
    ? formatUsd(parseFloat(amount) * ethPrice)
    : undefined;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <WalletHeader
        address={wallet.walletAddress}
        algorithm={wallet.algorithm as AlgorithmType}
        balance={balance}
      />

      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Send ETH</h2>

        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Recipient Address
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 outline-none focus:border-[#037DD6] focus:ring-1 focus:ring-[#037DD6] font-mono text-sm transition-colors"
          />
        </div>

        <AmountInput
          label="Amount"
          value={amount}
          onChange={setAmount}
          token="ETH"
          usdEquivalent={usdEquivalent}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {txHash && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-green-800 text-sm font-semibold mb-2">
              Transaction sent!
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
          onClick={handleSend}
          disabled={sending || !recipient || !amount}
          className="w-full py-3 rounded-xl bg-[#037DD6] hover:bg-[#0260A4] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold transition-colors"
        >
          {sending ? "Signing & sending..." : "Send"}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Your transaction will be signed with your PQ private key in the
          browser, then relayed through the backend.
        </p>
      </div>
    </div>
  );
}
