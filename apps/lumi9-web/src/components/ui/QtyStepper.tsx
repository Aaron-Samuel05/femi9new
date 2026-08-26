"use client";

/** −/+ stepper, clamped at 1. */
export function QtyStepper({
  qty,
  onChange,
  size = "md",
  label = "Quantity",
}: {
  qty: number;
  onChange: (next: number) => void;
  size?: "sm" | "md";
  label?: string;
}) {
  const dims = size === "sm" ? "w-11 h-11 text-[19px]" : "w-[46px] h-13 text-[22px]";
  const valueWidth = size === "sm" ? "min-w-6 text-[15px]" : "min-w-7 text-[17px]";

  return (
    <div
      className="flex items-center rounded-pill border-[1.5px] border-moss-tint"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, qty - 1))}
        disabled={qty <= 1}
        aria-label="Decrease quantity"
        className={`cursor-pointer text-midnight disabled:cursor-not-allowed disabled:opacity-40 ${dims}`}
      >
        −
      </button>
      <span className={`text-center font-bold ${valueWidth}`} aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        aria-label="Increase quantity"
        className={`cursor-pointer text-midnight ${dims}`}
      >
        +
      </button>
    </div>
  );
}
