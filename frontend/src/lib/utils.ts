export function bytesToHex(bytes: Uint8Array): string {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function truncateHex(hex: string | undefined | null, startChars = 6, endChars = 4): string {
  if (!hex) return "—";
  if (hex.length <= startChars + endChars + 2) return hex;
  return `${hex.slice(0, startChars + 2)}...${hex.slice(-endChars)}`;
}

export function truncateAddress(address: string | undefined | null): string {
  if (!address) return "—";
  return truncateHex(address, 6, 4);
}

export function weiToEth(weiHex: string | undefined | null): string {
  if (!weiHex) return "0.0000";
  try {
    const wei = BigInt(weiHex);
    const eth = Number(wei) / 1e18;
    return eth.toFixed(4);
  } catch {
    return "0.0000";
  }
}

export function ethToWei(eth: string): string {
  const wei = BigInt(Math.floor(parseFloat(eth) * 1e18));
  return "0x" + wei.toString(16);
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatEth(eth: number | string): string {
  const val = typeof eth === "string" ? parseFloat(eth) : eth;
  return val.toFixed(4) + " ETH";
}

export type AlgorithmType =
  | "falcon-direct"
  | "falcon-ntt"
  | "dilithium-direct"
  | "dilithium-ntt"
  | "ephemeral-ecdsa";

export function algorithmDisplayName(algo: AlgorithmType): string {
  switch (algo) {
    case "falcon-direct":
      return "Falcon-512 Direct";
    case "falcon-ntt":
      return "Falcon-512 NTT";
    case "dilithium-direct":
      return "Dilithium-2 Direct";
    case "dilithium-ntt":
      return "Dilithium-2 NTT";
    case "ephemeral-ecdsa":
      return "Ephemeral ECDSA";
  }
}

export function algorithmColor(algo: AlgorithmType): string {
  switch (algo) {
    case "falcon-direct":
      return "bg-blue-700";
    case "falcon-ntt":
      return "bg-teal-700";
    case "dilithium-direct":
      return "bg-violet-700";
    case "dilithium-ntt":
      return "bg-fuchsia-700";
    case "ephemeral-ecdsa":
      return "bg-amber-800";
  }
}

export function isFalcon(algo: AlgorithmType): boolean {
  return algo.startsWith("falcon");
}

export function isEphemeralECDSA(algo: AlgorithmType): boolean {
  return algo === "ephemeral-ecdsa";
}

export function fingerprint(publicKey: Uint8Array): string {
  return bytesToHex(publicKey.slice(0, 8));
}
