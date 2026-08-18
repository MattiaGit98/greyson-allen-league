"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

export function RouteScrollReset() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!window.location.hash) window.scrollTo(0, 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
