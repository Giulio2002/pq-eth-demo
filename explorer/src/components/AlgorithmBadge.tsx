"use client";

import React from "react";

export type SchemeType =
  | "falcon-direct"
  | "falcon-ntt"
  | "dilithium-direct"
  | "dilithium-ntt"
  | "ephemeral-ecdsa"
  | "ecdsa"
  | "7702";

interface AlgorithmBadgeProps {
  scheme: string;
  size?: "sm" | "md" | "lg";
}

const SCHEME_CONFIG: Record<
  SchemeType,
  { label: string; subLabel?: string; bgColor: string; textColor: string }
> = {
  "falcon-direct": {
    label: "Falcon-512",
    subLabel: "Direct",
    bgColor: "bg-blue-100",
    textColor: "text-blue-700",
  },
  "falcon-ntt": {
    label: "Falcon-512",
    subLabel: "Lego",
    bgColor: "bg-teal-100",
    textColor: "text-teal-700",
  },
  "dilithium-direct": {
    label: "Dilithium-2",
    subLabel: "Direct",
    bgColor: "bg-purple-100",
    textColor: "text-purple-700",
  },
  "dilithium-ntt": {
    label: "Dilithium-2",
    subLabel: "Lego",
    bgColor: "bg-pink-100",
    textColor: "text-pink-700",
  },
  "ephemeral-ecdsa": {
    label: "Ephemeral ECDSA",
    subLabel: "Key Rotation",
    bgColor: "bg-amber-700",
    textColor: "text-white",
  },
  ecdsa: {
    label: "ECDSA",
    bgColor: "bg-gray-100",
    textColor: "text-gray-600",
  },
  "7702": {
    label: "7702-Migration",
    bgColor: "bg-amber-100",
    textColor: "text-amber-700",
  },
};

function normalizeScheme(scheme: string): SchemeType {
  const s = scheme.toLowerCase().trim();
  if (s === "falcon-direct" || s === "falcon_direct" || s === "falcon" || s === "0") return "falcon-direct";
  if (s === "falcon-ntt" || s === "falcon_ntt" || s === "2") return "falcon-ntt";
  if (s === "dilithium-direct" || s === "dilithium_direct" || s === "dilithium" || s === "1") return "dilithium-direct";
  if (s === "dilithium-ntt" || s === "dilithium_ntt" || s === "3") return "dilithium-ntt";
  if (s === "ephemeral-ecdsa" || s === "ephemeral_ecdsa" || s === "4") return "ephemeral-ecdsa";
  if (s === "7702" || s === "7702-migration" || s === "eip-7702") return "7702";
  return "ecdsa";
}

export default function AlgorithmBadge({ scheme, size = "md" }: AlgorithmBadgeProps) {
  const normalized = normalizeScheme(scheme);
  const config = SCHEME_CONFIG[normalized];

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-xs px-2 py-1",
    lg: "text-sm px-3 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.bgColor} ${config.textColor} ${sizeClasses[size]}`}
    >
      <span>{config.label}</span>
      {config.subLabel && (
        <span className="opacity-70 text-[0.65rem]">{config.subLabel}</span>
      )}
    </span>
  );
}
