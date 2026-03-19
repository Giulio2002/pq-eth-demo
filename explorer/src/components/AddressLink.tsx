"use client";

import React from "react";
import Link from "next/link";
import { truncateAddress } from "@/lib/utils";

interface AddressLinkProps {
  address: string;
  truncate?: boolean;
  className?: string;
}

export default function AddressLink({ address, truncate = true, className = "" }: AddressLinkProps) {
  if (!address) return <span className="text-[#6c757d]">—</span>;

  return (
    <Link
      href={`/address/${address}`}
      className={`font-mono text-sm text-[#0784C3] hover:text-blue-800 hover:underline ${className}`}
      title={address}
    >
      {truncate ? truncateAddress(address) : address}
    </Link>
  );
}
