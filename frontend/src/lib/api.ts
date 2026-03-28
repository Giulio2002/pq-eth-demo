const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8546";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export interface CreateWalletResponse {
  walletAddress: string;
  txHash: string;
}

export async function createWallet(
  publicKey: string,
  algorithm: string
): Promise<CreateWalletResponse> {
  return apiFetch("/api/wallet/create", {
    method: "POST",
    body: JSON.stringify({ publicKey, algorithm }),
  });
}

export interface WalletInfo {
  address: string;
  algorithm: string;
  publicKey: string;
  nonce: number;
  payer: string;
}

export async function getWallet(address: string): Promise<WalletInfo> {
  return apiFetch(`/api/wallet/${address}`);
}

export interface Assets {
  eth: string;
  weth: string;
  usd: string;
  jedkh?: string;
}

export async function getAssets(address: string): Promise<Assets> {
  return apiFetch(`/api/wallet/${address}/assets`);
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  status: string;
  blockNumber: number;
  timestamp: number;
  type: string;
}

export async function getTransactions(
  address: string
): Promise<Transaction[]> {
  return apiFetch(`/api/wallet/${address}/transactions`);
}

export interface ExecuteMessageResponse {
  messageHash: string;
}

export async function getExecuteMessage(
  wallet: string,
  to: string,
  value: string,
  data: string,
  nextSigner?: string
): Promise<ExecuteMessageResponse> {
  const body: Record<string, string> = { wallet, to, value, data };
  if (nextSigner) body.nextSigner = nextSigner;
  return apiFetch("/api/wallet/execute-message", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface ExecuteResponse {
  txHash: string;
}

export async function execute(
  wallet: string,
  to: string,
  value: string,
  data: string,
  signature: string
): Promise<ExecuteResponse> {
  return apiFetch("/api/wallet/execute", {
    method: "POST",
    body: JSON.stringify({ wallet, to, value, data, signature }),
  });
}

export interface SwapMessageResponse {
  messageHash: string;
}

export async function getSwapMessage(
  wallet: string,
  direction: string,
  amountIn: string,
  minAmountOut: string,
  nextSigner?: string
): Promise<SwapMessageResponse> {
  const body: Record<string, string> = { wallet, direction, amountIn, minAmountOut };
  if (nextSigner) body.nextSigner = nextSigner;
  return apiFetch("/api/wallet/swap-message", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface SwapResponse {
  txHash: string;
}

export async function swap(
  wallet: string,
  direction: string,
  amountIn: string,
  minAmountOut: string,
  signature: string
): Promise<SwapResponse> {
  return apiFetch("/api/wallet/swap", {
    method: "POST",
    body: JSON.stringify({
      wallet,
      direction,
      amountIn,
      minAmountOut,
      signature,
    }),
  });
}

export interface PoolPrice {
  ethUsd: number;
  jedkhEth?: number;
  jedkhUsd?: number;
}

export async function getPoolPrice(): Promise<PoolPrice> {
  return apiFetch("/api/chain/pool-price");
}

export interface ChainBlock {
  blockNumber: number;
  timestamp: number;
}

export async function getChainBlock(): Promise<ChainBlock> {
  return apiFetch("/api/chain/block");
}
