"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import type { SizeCode } from "@/lib/catalog";

/** Round "+" add-to-cart control used on the product cards. */
export function AddButton({
  size,
  count,
  label,
}: {
  size: SizeCode;
  count: number;
  label: string;
}) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        add(size, count);
        setAdded(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setAdded(false), 1200);
      }}
      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-midnight text-xl font-semibold text-butter transition-colors hover:bg-[#171a03]"
    >
      <span aria-hidden>{added ? "✓" : "+"}</span>
    </button>
  );
}
