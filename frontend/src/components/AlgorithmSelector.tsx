"use client";

import { AlgorithmType, algorithmDisplayName, algorithmColor } from "@/lib/utils";

interface AlgorithmOption {
  id: AlgorithmType;
  name: string;
  approach: string;
  gasCost: string;
  tradeoff: string;
  description: string;
  disabled?: boolean;
}

const algorithms: AlgorithmOption[] = [
  {
    id: "falcon-direct",
    name: "Falcon-512 Direct",
    approach: "Direct precompile",
    gasCost: "~2,800",
    tradeoff: "Fastest, single opaque call",
    description:
      "Single precompile call (address 0x17). Verification is efficient but not inspectable on-chain.",
  },
  {
    id: "falcon-ntt",
    name: "Falcon-512 NTT",
    approach: "Lego (composite)",
    gasCost: "~5,000+",
    tradeoff: "Transparent, each step auditable",
    description:
      "Uses building-block precompiles (NTT, SHAKE, polynomial ops) step-by-step. Each cryptographic operation is a separate on-chain call.",
  },
  {
    id: "dilithium-direct",
    name: "Dilithium-2 Direct",
    approach: "Direct precompile",
    gasCost: "~119,000",
    tradeoff: "NIST standard, single call",
    description:
      "Single precompile call (address 0x1b). Dilithium-2 (Dilithium) is the NIST post-quantum signature standard.",
  },
  {
    id: "dilithium-ntt",
    name: "Dilithium-2 NTT",
    approach: "Lego (composite)",
    gasCost: "~150,000+",
    tradeoff: "NIST standard, fully transparent",
    description:
      "Composes NTT, ExpandA, vector arithmetic precompiles step-by-step. Each verification step is individually visible on-chain.",
  },
];

interface AlgorithmSelectorProps {
  selected: AlgorithmType | null;
  onSelect: (algorithm: AlgorithmType) => void;
}

export default function AlgorithmSelector({
  selected,
  onSelect,
}: AlgorithmSelectorProps) {
  return (
    <div className="space-y-4">
      {/* Comparison table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Algorithm</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Approach</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Gas Cost</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Trade-off</th>
            </tr>
          </thead>
          <tbody>
            {algorithms.map((algo, i) => (
              <tr
                key={algo.id}
                className={`transition-colors ${
                  algo.disabled
                    ? "bg-gray-50 opacity-50 cursor-not-allowed"
                    : selected === algo.id
                    ? "bg-[#EAF6FF] cursor-pointer"
                    : "bg-white hover:bg-gray-50 cursor-pointer"
                } ${i < algorithms.length - 1 ? "border-b border-gray-100" : ""}`}
                onClick={() => !algo.disabled && onSelect(algo.id)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`${algorithmColor(algo.id)} text-white text-xs font-semibold px-2 py-0.5 rounded-full shadow-sm`}
                    >
                      {algo.approach === "Lego (composite)" ? "Lego" : "Direct"}
                    </span>
                    <span className="font-medium text-gray-900">{algo.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{algo.approach}</td>
                <td className="px-4 py-3 font-mono text-gray-700">{algo.gasCost}</td>
                <td className="px-4 py-3 text-gray-600">{algo.tradeoff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Algorithm cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {algorithms.map((algo) => (
          <button
            key={algo.id}
            onClick={() => !algo.disabled && onSelect(algo.id)}
            disabled={algo.disabled}
            className={`p-4 rounded-2xl border-2 text-left transition-all ${
              algo.disabled
                ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
                : selected === algo.id
                ? "border-[#037DD6] bg-[#EAF6FF] shadow-card-hover"
                : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-card"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`${algorithmColor(algo.id)} text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-sm`}
              >
                {algorithmDisplayName(algo.id)}
              </span>
              {selected === algo.id && (
                <svg className="w-4 h-4 text-[#037DD6] ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{algo.description}</p>
            <p className="text-xs text-gray-400 mt-2 font-medium">
              Gas: {algo.gasCost}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
