import { Activity, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSSE } from "@/hooks/use-sse";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

type Props = {
  reachable: boolean;
  sending: boolean;
  notice: string | null;
  noticeKind: "ok" | "error" | null;
  onSimulate: () => void;
};

export function Header({ reachable, sending, notice, noticeKind, onSimulate }: Props) {
  const { status } = useSSE();
  const sseLive = status === "open";
  const [watchdogEnabled, setWatchdogEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    apiFetch('/api/health')
      .then((res) => res.json())
      .then((data: any) => {
        if (data && typeof data.watchdogEnabled === 'boolean') {
          setWatchdogEnabled(data.watchdogEnabled);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Into the Scrape-Verse
          </p>
          <h1 className="font-serif text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
            Mandipulse
          </h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Wholesale produce prices, watched and repaired when the scrape drifts.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={reachable ? "healthy" : "failed"}>
              <span className={`size-1.5 rounded-full ${reachable ? "bg-healthy" : "bg-failed"}`} />
              {reachable ? "API OK" : "API down"}
            </Badge>
            {watchdogEnabled === false && (
              <Badge tone="default" title="WATCHDOG_ENABLED is false in the backend environment. Periodic crons will not run.">
                WATCHDOG DISABLED
              </Badge>
            )}
            <Badge tone={sseLive ? "healthy" : status === "error" ? "failed" : "degraded"}>
              <Radio className="size-3" />
              {sseLive ? "Stream" : status === "error" ? "Reconnect" : "Connecting"}
            </Badge>
          </div>
          <Button onClick={onSimulate} disabled={sending} className="w-full h-10 min-h-[40px] sm:w-auto sm:min-w-40 gap-2">
            <Activity className="size-4" />
            {sending ? "Replaying…" : "Run drift replay"}
          </Button>
        </div>
      </div>
      {notice && (
        <p
          className={`mx-auto max-w-6xl px-4 pb-3 font-mono text-xs sm:px-6 ${
            noticeKind === "error" ? "text-failed" : "text-healthy"
          }`}
        >
          {notice}
        </p>
      )}
    </header>
  );
}
