"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function AdminSuccessFeedback() {
  const pathname = usePathname();
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMessage("");
    const main = document.querySelector("main");
    if (!main) return;
    let currentUrl = `${window.location.pathname}${window.location.search}`;
    let confirmedMessage = "";
    const sync = () => {
      const nextUrl = `${window.location.pathname}${window.location.search}`;
      if (nextUrl !== currentUrl) {
        currentUrl = nextUrl;
        confirmedMessage = "";
        setMessage("");
        main.querySelectorAll("[data-live-outdated]").forEach((notice) => { notice.removeAttribute("data-live-outdated"); });
      }
      const notices = [...main.querySelectorAll<HTMLElement>(".notice.success:not([data-live-outdated])")]
        .filter((notice) => !notice.closest(".admin-success-feedback"));
      if (!notices.length) return;
      notices.forEach((notice) => { notice.dataset.adminFeedbackMirrored = "true"; });
      const nextMessage = [...new Set(notices.map((notice) => notice.textContent?.trim()).filter(Boolean))].join(" · ");
      if (nextMessage && nextMessage !== confirmedMessage) {
        confirmedMessage = nextMessage;
        setMessage(nextMessage);
        window.dispatchEvent(new Event("admin-action-confirmed"));
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(main, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-live-outdated"] });
    const clearOnSubmit = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("form")) {
        confirmedMessage = "";
        setMessage("");
      }
    };
    main.addEventListener("submit", clearOnSubmit);
    sync();
    return () => {
      observer.disconnect();
      main.removeEventListener("submit", clearOnSubmit);
    };
  }, [pathname]);

  return message ? <div className="admin-success-feedback" role="status" aria-live="polite">{message}</div> : null;
}
