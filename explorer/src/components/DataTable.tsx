"use client";

import React from "react";

interface DataTableProps {
  headers: string[];
  children: React.ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export default function DataTable({
  headers,
  children,
  emptyMessage = "No data available",
  isEmpty = false,
  currentPage,
  totalPages,
  onPageChange,
}: DataTableProps) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e7eaf3]">
              {headers.map((header) => (
                <th
                  key={header}
                  className="py-3 px-4 text-left text-xs font-semibold text-[#6c757d] uppercase tracking-wider bg-gray-50"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {isEmpty ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="py-12 text-center text-[#6c757d]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
      {totalPages !== undefined && totalPages > 1 && currentPage !== undefined && onPageChange && (
        <div className="flex items-center justify-between py-3 px-4 border-t border-[#e7eaf3]">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="px-4 py-1.5 text-sm bg-white border border-[#e7eaf3] text-[#6c757d] rounded-md hover:bg-gray-50 hover:text-[#0784C3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-[#6c757d]">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="px-4 py-1.5 text-sm bg-white border border-[#e7eaf3] text-[#6c757d] rounded-md hover:bg-gray-50 hover:text-[#0784C3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
