"use client";

import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
  icon?: React.ReactNode;
}

export default function StatCard({ label, value, subValue, color, icon }: StatCardProps) {
  return (
    <div className="bg-white border border-[#e7eaf3] rounded-lg p-4 flex items-start gap-3">
      {icon && (
        <div className="flex-shrink-0 mt-0.5">{icon}</div>
      )}
      <div className="min-w-0">
        <p className="text-sm text-[#6c757d] mb-1">{label}</p>
        <p className={`text-xl font-bold ${color || "text-[#1a1a1a]"}`}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {subValue && <p className="text-xs text-[#6c757d] mt-1">{subValue}</p>}
      </div>
    </div>
  );
}
