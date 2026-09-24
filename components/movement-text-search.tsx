"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function MovementTextSearch({
  initialValue,
  path,
  preservedParams = {},
}: {
  initialValue: string;
  path: "/movimenti" | "/admin/movimenti";
  preservedParams?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const preservedQuery = useMemo(() => JSON.stringify(preservedParams), [preservedParams]);
  const submittedValue = useRef(initialValue);

  useEffect(() => {
    if (initialValue === submittedValue.current) return;
    submittedValue.current = initialValue;
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const query = value.replace(/\s+/g, " ").trim();
    if (query === initialValue) return;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();
      Object.entries(JSON.parse(preservedQuery) as Record<string, string | undefined>).forEach(([key, parameter]) => {
        if (parameter) params.set(key, parameter);
      });
      if (query) params.set("q", query);
      const suffix = params.toString();
      submittedValue.current = query;
      startTransition(() => router.replace(suffix ? `${path}?${suffix}` : path, { scroll: false }));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [initialValue, path, preservedQuery, router, value]);

  return (
    <label className="movement-text-search">
      <span>Cerca</span>
      <input
        type="search"
        name="q"
        value={value}
        maxLength={80}
        autoComplete="off"
        placeholder="Cerca nei movimenti…"
        aria-label="Cerca nei movimenti"
        aria-busy={pending}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
}
