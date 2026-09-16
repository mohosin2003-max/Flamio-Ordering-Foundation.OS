import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy } from "lucide-react";
import { useEffect, useState } from "react";

import { listWinnerTicker } from "@/lib/challenges.functions";

const PREFIXES = ["🏆", "🎉", "🔥"];

/** Reusable recent-winner ticker. Shows display names only — never private details. */
export function WinnerTicker({ className }: { className?: string }) {
  const fetchTicker = useServerFn(listWinnerTicker);
  const ticker = useQuery({
    queryKey: ["challenge-winner-ticker"],
    queryFn: () => fetchTicker(),
    staleTime: 60_000,
  });
  const [index, setIndex] = useState(0);
  const winners = ticker.data?.winners ?? [];
  const duration = (ticker.data?.durationSeconds ?? 4) * 1000;

  useEffect(() => {
    if (winners.length <= 1) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % winners.length), duration);
    return () => window.clearInterval(timer);
  }, [winners.length, duration]);

  if (!ticker.data?.enabled || winners.length === 0) return null;
  const winner = winners[index % winners.length]!;

  return (
    <div
      className={
        className ??
        "flex items-center gap-2 overflow-hidden rounded-xl border border-primary/25 bg-secondary/50 px-3 py-2"
      }
      aria-live="polite"
    >
      <Trophy className="size-4 shrink-0 text-primary" />
      <p key={winner.id} className="animate-in fade-in slide-in-from-bottom-2 truncate text-sm">
        {PREFIXES[index % PREFIXES.length]} <span className="font-semibold">{winner.displayName}</span>{" "}
        just won {winner.rewardName}!
      </p>
    </div>
  );
}
