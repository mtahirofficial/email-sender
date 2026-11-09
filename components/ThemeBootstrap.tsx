"use client";

import { useEffect } from "react";

export default function ThemeBootstrap() {
  useEffect(() => {
    try {
      const theme = window.localStorage.getItem("outbox:theme") === "dark" ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      window.dispatchEvent(new Event("outbox:theme-change"));
    } catch {
      document.documentElement.dataset.theme = "light";
      window.dispatchEvent(new Event("outbox:theme-change"));
    }
  }, []);

  return null;
}
