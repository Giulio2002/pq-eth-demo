const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8546";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545";

// ─── Backend API ────────────────────────────────────────────────────────────

export interface ExplorerStats {
  currentBlock: number;
  totalWallets: number;
  totalPqTransactions: number;
  falconWallets: number;
  dilithiumWallets: number;
  falconDirectWallets: number;
  falconNttWallets: number;
  dilithiumDirectWallets: number;
  dilithiumNttWallets: number;
}

// Raw shape from the backend /api/explorer/stats
interface RawStats {
  currentBlock: number;
  totalWallets: number;
  totalTransactions: number;
  falconWallets: number;
  dilithiumWallets: number;
  falconTransactions: number;
  dilithiumTransactions: number;
}

export interface ExplorerTransaction {
  hash: string;
  blockNumber: number;
  blockHash: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  timestamp: number;
  status: string;
  inputData: string;
  signatureScheme: string;
  algorithm: number;
  publicKey: string;
  walletAddress: string;
  txType: string;
  nonce: number;
}

// Raw shape from backend /api/explorer/recent-transactions
interface RawTransaction {
  txHash: string;
  walletAddress: string;
  to: string;
  value: string;
  status: string;
  type: string;
  signatureScheme: string;
  verificationGas: number;
  blockNumber?: number;
  timestamp?: string; // RFC3339
}

export interface ExplorerBlock {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  gasUsed: string;
  gasLimit: string;
  txCount: number;
  pqTxCount: number;
}

// Raw shape from backend /api/explorer/recent-blocks
interface RawBlock {
  blockNumber: number;
  blockHash: string;
  timestamp: string; // RFC3339
  gasUsed: number;
  txCount?: number;
  pqTxCount?: number;
}

export interface ExplorerWallet {
  address: string;
  algorithm: number;
  signatureScheme: string;
  publicKey: string;
  nonce: number;
  payer: string;
  is7702: boolean;
  createdAt: string;
  creationTxHash: string;
  txCount: number;
  ethBalance: string;
}

// Raw shape from backend /api/explorer/wallets
interface RawWallet {
  address: string;
  algorithm: string;
  publicKeyPrefix: string;
  transactionCount: number;
  isMigrated7702: boolean;
  createdAt: string; // RFC3339
  ethBalance: string;
}

function mapRawWallet(raw: RawWallet): ExplorerWallet {
  // Convert algorithm string to a scheme string and numeric id
  let algoNum = 0;
  let scheme = "ecdsa";
  if (raw.algorithm === "falcon" || raw.algorithm === "falcon-direct") {
    algoNum = 0;
    scheme = "falcon-direct";
  } else if (raw.algorithm === "falcon-ntt") {
    algoNum = 2;
    scheme = "falcon-ntt";
  } else if (raw.algorithm === "dilithium" || raw.algorithm === "dilithium-direct") {
    algoNum = 1;
    scheme = "dilithium-direct";
  } else if (raw.algorithm === "dilithium-ntt") {
    algoNum = 3;
    scheme = "dilithium-ntt";
  }
  return {
    address: raw.address,
    algorithm: algoNum,
    signatureScheme: scheme,
    publicKey: raw.publicKeyPrefix || "",
    nonce: 0,
    payer: "",
    is7702: raw.isMigrated7702,
    createdAt: String(toUnixSeconds(raw.createdAt)),
    creationTxHash: "",
    txCount: raw.transactionCount,
    ethBalance: raw.ethBalance || "0",
  };
}

export interface ExplorerAddress {
  address: string;
  isPqWallet: boolean;
  wallet?: ExplorerWallet;
  ethBalance: string;
  wethBalance: string;
  usdBalance: string;
  txCount: number;
  transactions: ExplorerTransaction[];
}

/** Convert an RFC3339 timestamp string to a unix epoch number (seconds). */
function toUnixSeconds(ts: string | undefined): number {
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

/**
 * Infer the full signature scheme (e.g. "falcon-direct") from the backend's
 * abbreviated scheme ("falcon") and the verification gas cost.
 * Gas costs: falcon-direct=2800, falcon-ntt=5000, dilithium-direct=119000, dilithium-ntt=150000
 */
function inferScheme(scheme: string, verificationGas: number): string {
  if (scheme === "falcon") {
    return verificationGas >= 5000 ? "falcon-ntt" : "falcon-direct";
  }
  if (scheme === "dilithium") {
    return verificationGas >= 150000 ? "dilithium-ntt" : "dilithium-direct";
  }
  // Already fully qualified or unknown
  return scheme;
}

function mapRawTx(raw: RawTransaction): ExplorerTransaction {
  return {
    hash: raw.txHash,
    blockNumber: raw.blockNumber ?? 0,
    blockHash: "",
    from: raw.walletAddress,
    to: raw.to,
    value: raw.value,
    gasUsed: "",
    gasPrice: "",
    timestamp: toUnixSeconds(raw.timestamp),
    status: raw.status,
    inputData: "",
    signatureScheme: inferScheme(raw.signatureScheme, raw.verificationGas),
    algorithm: 0,
    publicKey: "",
    walletAddress: raw.walletAddress,
    txType: raw.type,
    nonce: 0,
  };
}

async function apiFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getStats(): Promise<ExplorerStats | null> {
  const raw = await apiFetch<RawStats>("/api/explorer/stats");
  if (!raw) return null;
  return {
    currentBlock: raw.currentBlock,
    totalWallets: raw.totalWallets,
    totalPqTransactions: raw.totalTransactions,
    falconWallets: raw.falconWallets,
    dilithiumWallets: raw.dilithiumWallets,
    // Backend doesn't split direct/ntt yet — put all under "direct" for now
    falconDirectWallets: raw.falconWallets,
    falconNttWallets: 0,
    dilithiumDirectWallets: raw.dilithiumWallets,
    dilithiumNttWallets: 0,
  };
}

export async function getRecentTransactions(limit: number = 50): Promise<ExplorerTransaction[]> {
  const data = await apiFetch<RawTransaction[] | { transactions: RawTransaction[] }>(
    `/api/explorer/recent-transactions?limit=${limit}`
  );
  if (!data) return [];
  const rawList: RawTransaction[] = Array.isArray(data) ? data : (data.transactions || []);
  return rawList.map(mapRawTx);
}

export async function getRecentBlocks(limit: number = 20): Promise<ExplorerBlock[]> {
  const data = await apiFetch<RawBlock[] | { blocks: RawBlock[] }>(
    `/api/explorer/recent-blocks?limit=${limit}`
  );
  if (!data) return [];
  const rawList: RawBlock[] = Array.isArray(data) ? data : (data.blocks || []);
  return rawList.map((raw) => ({
    number: raw.blockNumber,
    hash: raw.blockHash,
    parentHash: "",
    timestamp: toUnixSeconds(raw.timestamp),
    gasUsed: String(raw.gasUsed),
    gasLimit: "",
    txCount: raw.txCount ?? 0,
    pqTxCount: raw.pqTxCount ?? 0,
  }));
}

export async function getTransaction(hash: string): Promise<ExplorerTransaction | null> {
  const raw = await apiFetch<RawTransaction & { publicKey?: string; gasUsed?: number; isMigrated7702?: boolean }>(
    `/api/explorer/tx/${hash}`
  );
  if (!raw) return null;
  const mapped = mapRawTx(raw);
  if (raw.publicKey) mapped.publicKey = raw.publicKey;
  if (raw.gasUsed !== undefined) mapped.gasUsed = String(raw.gasUsed);
  return mapped;
}

export async function getWallets(params?: {
  algorithm?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<ExplorerWallet[]> {
  const searchParams = new URLSearchParams();
  if (params?.algorithm) searchParams.set("algorithm", params.algorithm);
  if (params?.sort) searchParams.set("sort", params.sort);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());
  const qs = searchParams.toString();
  const data = await apiFetch<RawWallet[] | { wallets: RawWallet[] }>(
    `/api/explorer/wallets${qs ? `?${qs}` : ""}`
  );
  if (!data) return [];
  const rawList: RawWallet[] = Array.isArray(data) ? data : (data.wallets || []);
  return rawList.map(mapRawWallet);
}

// Raw shape from backend /api/explorer/address/{address}
interface RawAddress {
  address: string;
  isPQWallet: boolean;
  ethBalance: string;
  wethBalance?: string;
  usdBalance?: string;
  // Present when isPQWallet is true:
  algorithm?: string;
  publicKey?: string;
  nonce?: number;
  payer?: string;
  isMigrated7702?: boolean;
  transactionCount?: number;
  createdAt?: string;
  creationTxHash?: string;
}

export async function getAddress(address: string): Promise<ExplorerAddress | null> {
  const raw = await apiFetch<RawAddress>(`/api/explorer/address/${address}`);
  if (!raw) return null;

  let wallet: ExplorerWallet | undefined;
  if (raw.isPQWallet) {
    let algoNum = 0;
    let scheme = "ecdsa";
    const alg = raw.algorithm || "";
    if (alg === "falcon" || alg === "falcon-direct") { algoNum = 0; scheme = "falcon-direct"; }
    else if (alg === "falcon-ntt") { algoNum = 2; scheme = "falcon-ntt"; }
    else if (alg === "dilithium" || alg === "dilithium-direct") { algoNum = 1; scheme = "dilithium-direct"; }
    else if (alg === "dilithium-ntt") { algoNum = 3; scheme = "dilithium-ntt"; }

    wallet = {
      address: raw.address,
      algorithm: algoNum,
      signatureScheme: scheme,
      publicKey: raw.publicKey || "",
      nonce: raw.nonce || 0,
      payer: raw.payer || "",
      is7702: raw.isMigrated7702 || false,
      createdAt: raw.createdAt ? String(toUnixSeconds(raw.createdAt)) : "",
      creationTxHash: raw.creationTxHash || "",
      txCount: raw.transactionCount || 0,
      ethBalance: raw.ethBalance || "0",
    };
  }

  // Fetch transactions for this address from the recent-transactions endpoint
  const allTxs = await getRecentTransactions(200);
  const addrLower = raw.address.toLowerCase();
  const addrTxs = allTxs.filter(
    (tx) => tx.from?.toLowerCase() === addrLower || tx.walletAddress?.toLowerCase() === addrLower
  );

  return {
    address: raw.address,
    isPqWallet: raw.isPQWallet,
    wallet,
    ethBalance: raw.ethBalance || "0",
    wethBalance: raw.wethBalance || "0",
    usdBalance: raw.usdBalance || "0",
    txCount: raw.transactionCount || 0,
    transactions: addrTxs,
  };
}

export async function getPoolPrice(): Promise<number | null> {
  const data = await apiFetch<{ price: number } | number>("/api/chain/pool-price");
  if (data === null) return null;
  if (typeof data === "number") return data;
  return data.price ?? null;
}

// ─── Direct RPC (fallback) ─────────────────────────────────────────────────

export async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
      cache: "no-store",
    });
    const json = await res.json();
    return json.result ?? null;
  } catch {
    return null;
  }
}

export interface RpcBlock {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
  transactions: string[] | RpcTransaction[];
  miner: string;
}

export interface RpcTransaction {
  hash: string;
  blockNumber: string;
  blockHash: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  input: string;
  nonce: string;
  type: string;
}

export interface RpcReceipt {
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
  from: string;
  to: string;
  gasUsed: string;
  status: string;
  logs: unknown[];
}

export async function getBlockNumber(): Promise<number> {
  const result = await rpcCall("eth_blockNumber", []);
  return result ? parseInt(result as string, 16) : 0;
}

export async function getBlock(number: number | "latest", fullTxs: boolean = false): Promise<RpcBlock | null> {
  const blockParam = number === "latest" ? "latest" : `0x${number.toString(16)}`;
  return (await rpcCall("eth_getBlockByNumber", [blockParam, fullTxs])) as RpcBlock | null;
}

export async function getRpcTransaction(hash: string): Promise<RpcTransaction | null> {
  return (await rpcCall("eth_getTransactionByHash", [hash])) as RpcTransaction | null;
}

export async function getTransactionReceipt(hash: string): Promise<RpcReceipt | null> {
  return (await rpcCall("eth_getTransactionReceipt", [hash])) as RpcReceipt | null;
}

export async function getBalance(address: string): Promise<string> {
  const result = await rpcCall("eth_getBalance", [address, "latest"]);
  return (result as string) || "0x0";
}
