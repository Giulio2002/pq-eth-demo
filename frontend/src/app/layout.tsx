import type { Metadata } from "next";
import Link from "next/link";
import WalletSelector from "@/components/WalletSelector";
import "./globals.css";

export const metadata: Metadata = {
  title: "PQ Smart Wallet",
  description: "Post-Quantum Smart Wallet Demo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <nav className="border-b border-gray-200 bg-white sticky top-0 z-50 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#037DD6] flex items-center justify-center">
                <span className="text-white font-bold text-sm">PQ</span>
              </div>
              <span className="text-lg font-bold text-gray-900">
                PQ Wallet
              </span>
            </Link>
            <div className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="px-3 py-2 rounded-lg text-gray-600 hover:text-[#037DD6] hover:bg-[#EAF6FF] transition-colors font-medium"
              >
                Dashboard
              </Link>
              <Link
                href="/send"
                className="px-3 py-2 rounded-lg text-gray-600 hover:text-[#037DD6] hover:bg-[#EAF6FF] transition-colors font-medium"
              >
                Send
              </Link>
              <Link
                href="/swap"
                className="px-3 py-2 rounded-lg text-gray-600 hover:text-[#037DD6] hover:bg-[#EAF6FF] transition-colors font-medium"
              >
                Swap
              </Link>
              <Link
                href="/settings"
                className="px-3 py-2 rounded-lg text-gray-600 hover:text-[#037DD6] hover:bg-[#EAF6FF] transition-colors font-medium"
              >
                Settings
              </Link>
              <WalletSelector />
            </div>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
