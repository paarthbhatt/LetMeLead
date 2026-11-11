"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { getSession } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getSession()?.accessToken ? "/leads" : "/login");
  }, [router]);
  return <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</main>;
}
