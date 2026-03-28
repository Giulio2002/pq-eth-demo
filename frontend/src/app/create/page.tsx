"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AlgorithmSelector from "@/components/AlgorithmSelector";
import { initPQ, generateKeypair, isPQReady, deriveEphemeralAddress, EPHEMERAL_KEY_COUNT } from "@/lib/pq";
import { createWallet } from "@/lib/api";
import { saveWallet } from "@/lib/wallet-store";
import {
  bytesToHex,
  fingerprint,
  algorithmDisplayName,
  algorithmColor,
  isEphemeralECDSA,
  type AlgorithmType,
} from "@/lib/utils";

type Step = "select" | "keygen" | "deploy" | "done";

export default function CreateWallet() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select");
  const [algorithm, setAlgorithm] = useState<AlgorithmType | null>(null);
  const [pqReady, setPqReady] = useState(false);
  const [pqError, setPqError] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<Uint8Array | null>(null);
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initPQ()
      .then(() => setPqReady(true))
      .catch((err) => setPqError(`Failed to load PQ module: ${err.message}`));
  }, []);

  // Ephemeral ECDSA doesn't need WASM
  const readyToGenerate = algorithm ? (isEphemeralECDSA(algorithm) || pqReady) : false;

  function handleGenerateKeypair() {
    if (!algorithm) return;
    try {
      const kp = generateKeypair(algorithm);
      setPublicKey(kp.publicKey);
      setSecretKey(kp.secretKey);
      setStep("keygen");
    } catch (err) {
      setError(`Keygen failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleDeploy() {
    if (!algorithm || !publicKey || !secretKey) return;
    setDeploying(true);
    setError(null);
    try {
      const res = await createWallet(bytesToHex(publicKey), algorithm);
      await saveWallet({
        walletAddress: res.walletAddress,
        algorithm,
        publicKey: bytesToHex(publicKey),
        secretKey: bytesToHex(secretKey),
        ephemeralIndex: isEphemeralECDSA(algorithm) ? 0 : undefined,
        createdAt: new Date().toISOString(),
      });
      setStep("done");
      setTimeout(() => router.push("/"), 1500);
    } catch (err) {
      setError(`Deploy failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create PQ Wallet</h1>
        <p className="text-gray-500 mt-1">
          Generate a post-quantum keypair and deploy a smart wallet
        </p>
      </div>

      {/* Progress steps */}
      <div className="flex items-center gap-2 text-sm">
        {(["select", "keygen", "deploy"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-gray-300" />}
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                step === s || (["keygen", "deploy", "done"].indexOf(step) > ["select", "keygen", "deploy"].indexOf(s))
                  ? "bg-[#037DD6] text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {i + 1}
            </div>
            <span className="text-gray-500 capitalize text-sm">{s === "keygen" ? "Generate" : s}</span>
          </div>
        ))}
      </div>

      {pqError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {pqError}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Algorithm selection */}
      {step === "select" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Choose Wallet Type
          </h2>
          <AlgorithmSelector selected={algorithm} onSelect={setAlgorithm} />
          {algorithm && (
            <button
              onClick={handleGenerateKeypair}
              disabled={!readyToGenerate}
              className="w-full py-3 rounded-xl bg-[#037DD6] hover:bg-[#0260A4] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold transition-colors"
            >
              {readyToGenerate ? "Generate Keypair" : "Loading PQ module..."}
            </button>
          )}
        </div>
      )}

      {/* Step 2: Keypair generated */}
      {step === "keygen" && publicKey && algorithm && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Keypair Generated
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Algorithm</p>
                <span
                  className={`${algorithmColor(algorithm)} text-white text-sm px-3 py-1 rounded-full inline-block mt-1.5`}
                >
                  {algorithmDisplayName(algorithm)}
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Public Key Fingerprint</p>
                <p className="text-gray-900 font-mono mt-1.5">
                  {fingerprint(publicKey)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {isEphemeralECDSA(algorithm) ? "Initial Signer Address" : "Public Key Size"}
                </p>
                <p className="text-gray-900 font-mono mt-1.5">
                  {isEphemeralECDSA(algorithm) ? bytesToHex(publicKey) : `${publicKey.length} bytes`}
                </p>
              </div>
              {isEphemeralECDSA(algorithm) && secretKey && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pre-derived Signers ({EPHEMERAL_KEY_COUNT} total)
                  </p>
                  <div className="mt-1.5 max-h-32 overflow-y-auto bg-gray-50 rounded-lg p-2 font-mono text-xs text-gray-700 space-y-0.5">
                    {Array.from({ length: Math.min(10, EPHEMERAL_KEY_COUNT) }, (_, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-gray-400 w-8 text-right">#{i}</span>
                        <span>{bytesToHex(deriveEphemeralAddress(secretKey, i))}</span>
                      </div>
                    ))}
                    <div className="text-gray-400">... {EPHEMERAL_KEY_COUNT - 10} more</div>
                  </div>
                </div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-amber-800 text-sm">
                  {isEphemeralECDSA(algorithm)
                    ? `A 32-byte seed is stored in your browser. ${EPHEMERAL_KEY_COUNT} signing keys are derived deterministically. Each transaction uses the next key.`
                    : "Your private key is stored securely in your browser. It will never be sent to the backend or any external service."}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="w-full py-3 rounded-xl bg-[#28A745] hover:bg-[#218838] disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold transition-colors"
          >
            {deploying ? "Deploying..." : "Deploy Wallet"}
          </button>
        </div>
      )}

      {/* Step 3: Success */}
      {step === "done" && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-green-800 text-lg font-semibold">
            Wallet deployed successfully!
          </p>
          <p className="text-green-600 text-sm mt-2">
            Redirecting to dashboard...
          </p>
        </div>
      )}
    </div>
  );
}
