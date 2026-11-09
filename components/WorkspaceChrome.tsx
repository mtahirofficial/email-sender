"use client";

import { usePathname } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";

const WORKSPACE_ROOTS = [
  "/automation",
  "/compose",
  "/dashboard",
  "/email-test",
  "/inbox",
  "/profile",
  "/sent",
  "/settings",
  "/verify",
  "/admin",
];

export default function WorkspaceChrome() {
  const pathname = usePathname();
  const inWorkspace = WORKSPACE_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));

  return inWorkspace ? <SiteHeader /> : null;
}
