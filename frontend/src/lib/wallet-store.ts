import { openDB, IDBPDatabase } from "idb";
import type { AlgorithmType } from "./utils";

export interface StoredWallet {
  walletAddress: string;
  algorithm: AlgorithmType;
  publicKey: string;
  secretKey: string;       // PQ: hex private key. Ephemeral ECDSA: hex seed (32 bytes).
  ephemeralIndex?: number; // Ephemeral ECDSA: current key index (0..8191).
  createdAt: string;
}

const DB_NAME = "pq-wallet-demo";
const STORE_NAME = "wallets";
const DB_VERSION = 1;

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "walletAddress" });
      }
    },
  });
}

export async function saveWallet(wallet: StoredWallet): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, wallet);
}

export async function getWallet(
  address: string
): Promise<StoredWallet | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, address);
}

export async function getAllWallets(): Promise<StoredWallet[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

export async function deleteWallet(address: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, address);
}

export const MAX_WALLETS = 3;

const ACTIVE_KEY = "pq-active-wallet";

export function getActiveAddress(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveAddress(address: string): void {
  localStorage.setItem(ACTIVE_KEY, address);
}

export async function getActiveWallet(): Promise<StoredWallet | undefined> {
  const addr = getActiveAddress();
  if (addr) {
    const w = await getWallet(addr);
    if (w) return w;
  }
  // Fallback to first wallet
  const wallets = await getAllWallets();
  if (wallets.length > 0) {
    setActiveAddress(wallets[0].walletAddress);
    return wallets[0];
  }
  return undefined;
}

export async function getPrimaryWallet(): Promise<StoredWallet | undefined> {
  return getActiveWallet();
}
