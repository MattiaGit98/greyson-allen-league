"use client";

import { useEffect, useState, useTransition } from "react";
import { saveHomepageFeatureSelection } from "@/app/admin/home-feature-actions";

export function HomepageFeatureToggle({ kind, value, selected, onSelectionChange }: { kind: "honours" | "competition"; value: string; selected: boolean; onSelectionChange?: (value: string | null) => void }) {
  const [checked, setChecked] = useState(selected);
  const [pending, startTransition] = useTransition();
  useEffect(() => setChecked(selected), [selected]);
  return (
    <label className="homepage-feature-toggle">
      <input type="checkbox" checked={checked} disabled={pending} onChange={(event) => {
        const next = event.target.checked;
        setChecked(next);
        startTransition(async () => {
          const result = await saveHomepageFeatureSelection(kind, next ? value : null);
          if (result.error) setChecked(!next);
          else onSelectionChange?.(next ? value : null);
        });
      }} />
      <span>Mostra in homepage</span>
    </label>
  );
}
