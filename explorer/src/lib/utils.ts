/**
 * Truncate an address: 0x1234...abcd
 */
export function truncateAddress(address: string): string {
  if (!address || address.length < 12) return address || "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Truncate a tx hash: 0x1234567890...abcdef
 */
export function truncateHash(hash: string): string {
  if (!hash || hash.length < 18) return hash || "";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

/**
 * Convert wei (hex or decimal string) to ETH string with 4 decimal places.
 */
export function weiToEth(wei: string | number | bigint): string {
  try {
    const weiBigInt = BigInt(wei);
    const ethWhole = weiBigInt / BigInt(1e18);
    const ethFraction = weiBigInt % BigInt(1e18);
    const fractionStr = ethFraction.toString().padStart(18, "0").slice(0, 4);
    return `${ethWhole}.${fractionStr}`;
  } catch {
    return "0.0000";
  }
}

/**
 * Format ETH value with USD equivalent.
 */
export function formatEthWithUsd(wei: string | number | bigint, ethUsdPrice: number | null): string {
  const eth = weiToEth(wei);
  if (ethUsdPrice && ethUsdPrice > 0) {
    const usdValue = parseFloat(eth) * ethUsdPrice;
    return `${eth} ETH ($${usdValue.toFixed(2)})`;
  }
  return `${eth} ETH`;
}

/**
 * Format a unix timestamp to a human readable string.
 */
export function formatTimestamp(timestamp: number | string): string {
  try {
    const ts = typeof timestamp === "string" ? parseInt(timestamp, 16) || parseInt(timestamp, 10) : timestamp;
    if (!ts || ts === 0) return "—";
    const date = new Date(ts * 1000);
    return date.toLocaleString();
  } catch {
    return "—";
  }
}

/**
 * Format relative time (e.g., "5 seconds ago").
 */
export function timeAgo(timestamp: number | string): string {
  try {
    const ts = typeof timestamp === "string" ? parseInt(timestamp, 16) || parseInt(timestamp, 10) : timestamp;
    if (!ts || ts === 0) return "—";
    const seconds = Math.floor(Date.now() / 1000 - ts);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "—";
  }
}

/**
 * Parse a hex number string to a number.
 */
export function hexToNumber(hex: string): number {
  if (!hex) return 0;
  return parseInt(hex, 16);
}

/**
 * Parse a hex number string to BigInt.
 */
export function hexToBigInt(hex: string): bigint {
  if (!hex) return BigInt(0);
  return BigInt(hex);
}

/**
 * Format a large number with commas.
 */
export function formatNumber(n: number | string): string {
  const num = typeof n === "string" ? parseInt(n, 10) : n;
  if (isNaN(num)) return "0";
  return num.toLocaleString();
}

/**
 * Get the algorithm label from an algorithm ID.
 */
export function algorithmLabel(algorithm: number): string {
  switch (algorithm) {
    case 0: return "Falcon-512 Direct";
    case 1: return "Dilithium-2 Direct";
    case 2: return "Falcon-512 NTT";
    case 3: return "Dilithium-2 NTT";
    default: return "Unknown";
  }
}

/**
 * Map signatureScheme string to display info.
 */
export type SignatureScheme =
  | "falcon-direct"
  | "falcon-ntt"
  | "dilithium-direct"
  | "dilithium-ntt"
  | "ecdsa"
  | "7702"
  | string;

export function schemeFromAlgorithm(algorithm: number): SignatureScheme {
  switch (algorithm) {
    case 0: return "falcon-direct";
    case 1: return "dilithium-direct";
    case 2: return "falcon-ntt";
    case 3: return "dilithium-ntt";
    default: return "ecdsa";
  }
}
