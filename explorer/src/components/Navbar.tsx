"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/blocks", label: "Blocks" },
  { href: "/transactions", label: "Transactions" },
  { href: "/wallets", label: "PQ Wallets" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-[#e7eaf3] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#21325b] flex items-center justify-center">
              <span className="text-white font-bold text-sm">PQ</span>
            </div>
            <span className="text-[#21325b] font-bold text-lg">PQ-ETH Explorer</span>
          </Link>
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "text-[#0784C3] bg-blue-50"
                      : "text-[#6c757d] hover:text-[#0784C3] hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
