"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { setSession } from "@/lib/auth";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) {
      setError("The sign-in response was incomplete. Please try again.");
      return;
    }
    setSession({ accessToken, refreshToken });
    router.replace("/leads");
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center p-4 text-sm text-muted-foreground">
      {error ?? "Finishing sign-in…"}
    </main>
  );
}
