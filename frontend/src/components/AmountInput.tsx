"use client";

interface AmountInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  token: string;
  usdEquivalent?: string;
  placeholder?: string;
  disabled?: boolean;
}

export default function AmountInput({
  label,
  value,
  onChange,
  token,
  usdEquivalent,
  placeholder = "0.0",
  disabled = false,
}: AmountInputProps) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
      <label className="block text-xs font-medium text-gray-500 mb-2">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="any"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent text-2xl font-semibold text-gray-900 placeholder-gray-300 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-base font-semibold text-gray-500 bg-white px-3 py-1.5 rounded-full border border-gray-200">{token}</span>
      </div>
      {usdEquivalent && (
        <p className="text-xs text-gray-400 mt-2">{usdEquivalent}</p>
      )}
    </div>
  );
}
