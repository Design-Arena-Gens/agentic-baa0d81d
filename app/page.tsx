"use client";

import dynamic from "next/dynamic";

const ArBeatPad = dynamic(() => import("@/components/ArBeatPad"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-black">
      <div className="h-24 w-24 animate-spin rounded-full border-4 border-neo-cyan border-t-transparent" />
      <p className="text-sm uppercase tracking-[0.35em] text-white/60">Loading PulseCanvas</p>
    </div>
  )
});

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col bg-black">
      <ArBeatPad />
    </main>
  );
}
