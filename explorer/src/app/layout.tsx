import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PQ-ETH Explorer — Post-Quantum Block Explorer",
  description:
    "Block explorer for the PQ-ETH devnet, highlighting Falcon-512 and Dilithium-2 post-quantum signature schemes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#F8F9FA] text-[#1a1a1a] min-h-screen`}>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
