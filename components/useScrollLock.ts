"use client";

import { useEffect } from "react";

// Stops the page behind a pop-up or side panel from scrolling while it is open. Several can be open at once:
// the page is locked when the first opens and released when the last closes.
let locks = 0;
let saved = { html: "", body: "", padding: "" };

export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const body = document.body;
    if (locks === 0) {
      const scrollbar = window.innerWidth - html.clientWidth; // keep the page from jumping sideways when its scrollbar disappears
      saved = { html: html.style.overflow, body: body.style.overflow, padding: body.style.paddingRight };
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    }
    locks++;
    return () => {
      locks--;
      if (locks === 0) {
        html.style.overflow = saved.html;
        body.style.overflow = saved.body;
        body.style.paddingRight = saved.padding;
      }
    };
  }, [active]);
}
