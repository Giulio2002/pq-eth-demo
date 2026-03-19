"use client";

import React from "react";
import Link from "next/link";
import { truncateHash } from "@/lib/utils";

interface TxHashLinkProps {
  hash: string;
  truncate?: boolean;
  className?: string;
}

export default function TxHashLink({ hash, truncate = true, className = "" }: TxHashLinkProps) {
  if (!hash) return <span className="text-[#6c757d]">—</span>;

  return (
    <Link
      href={`/tx/${hash}`}
      className={`font-mono text-sm text-[#0784C3] hover:text-blue-800 hover:underline ${className}`}
      title={hash}
    >
      {truncate ? truncateHash(hash) : hash}
    </Link>
  );
}
