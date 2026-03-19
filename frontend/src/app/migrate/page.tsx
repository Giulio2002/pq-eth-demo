"use client";

import { useState, useEffect } from "react";
import { initPQ, generateKeypair, isPQReady } from "@/lib/pq";
import {
  bytesToHex,
  fingerprint,
  algorithmDisplayName,
  algorithmColor,
  type AlgorithmType,
} from "@/lib/utils";

export default function MigratePage() {
  const [pqReady, setPqReady] = useState(false);
  const [eoaAddress, setEoaAddress] = useState("");
  const [algorithm, setAlgorithm] = useState<AlgorithmType>("falcon-direct");
  const [publicKey, setPublicKey] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    initPQ()
      .then(() => setPqReady(true))
      .catch(() => {});
  }, []);

  function handleGenerate() {
    if (!isPQReady()) return;
    const kp = generateKeypair(algorithm);
    setPublicKey(kp.publicKey);
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">EIP-7702 Migration</h1>
        <p className="text-gray-500 mt-1">
          Upgrade an existing EOA to use post-quantum signatures
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
        This is an advanced feature. Your EOA will be upgraded to use PQ
        verification while keeping the same address.
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            EOA Address
          </label>
          <input
            type="text"
            value={eoaAddress}
            onChange={(e) => setEoaAddress(e.target.value)}
            placeholder="0x..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 outline-none focus:border-[#037DD6] focus:ring-1 focus:ring-[#037DD6] font-mono text-sm transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Algorithm</label>
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as AlgorithmType)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 outline-none focus:border-[#037DD6] focus:ring-1 focus:ring-[#037DD6] transition-colors"
          >
            <option value="falcon-direct">Falcon-512 Direct</option>
            <option value="falcon-ntt">Falcon-512 NTT</option>
            <option value="dilithium-direct">Dilithium-2 Direct</option>
            <option value="dilithium-ntt">Dilithium-2 NTT</option>
          </select>
        </div>

        {publicKey && (
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Generated PQ Public Key</p>
            <p className="text-gray-900 font-mono text-sm mt-1.5">
              {fingerprint(publicKey)}
            </p>
            <span
              className={`${algorithmColor(algorithm)} text-white text-xs px-2 py-0.5 rounded-full inline-block mt-2`}
            >
              {algorithmDisplayName(algorithm)}
            </span>
          </div>
        )}

        {status && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[#037DD6] text-sm">
            {status}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={!pqReady}
            className="flex-1 py-3 rounded-xl bg-[#037DD6] hover:bg-[#0260A4] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold transition-colors"
          >
            {pqReady ? "Generate PQ Keypair" : "Loading PQ..."}
          </button>
          <button
            onClick={() => setStatus("Migration not yet connected to backend")}
            disabled={!publicKey || !eoaAddress}
            className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold transition-colors"
          >
            Migrate
          </button>
        </div>
      </div>
    </div>
  );
}
