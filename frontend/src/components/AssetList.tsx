"use client";

interface AssetListProps {
  eth: string;
  weth: string;
  usd: string;
  ethPrice?: number;
}

export default function AssetList({ eth, weth, usd, ethPrice }: AssetListProps) {
  const ethVal = parseFloat(eth);
  const wethVal = parseFloat(weth);
  const usdVal = parseFloat(usd);

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-card">
      <h3 className="text-base font-semibold text-gray-900 mb-4">Assets</h3>
      <div className="space-y-1">
        <div className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#627EEA] rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm">
              E
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">ETH</p>
              <p className="text-xs text-gray-500">Ether</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900 font-mono">{ethVal.toFixed(4)}</p>
            {ethPrice && (
              <p className="text-xs text-gray-500">
                ${(ethVal * ethPrice).toFixed(2)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#EC6D8F] rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm">
              W
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">WETH</p>
              <p className="text-xs text-gray-500">Wrapped Ether</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900 font-mono">{wethVal.toFixed(4)}</p>
            {ethPrice && (
              <p className="text-xs text-gray-500">
                ${(wethVal * ethPrice).toFixed(2)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#2CA97E] rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm">
              $
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">USD</p>
              <p className="text-xs text-gray-500">Stablecoin</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-900 font-mono">{usdVal.toFixed(2)}</p>
            <p className="text-xs text-gray-500">${usdVal.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
