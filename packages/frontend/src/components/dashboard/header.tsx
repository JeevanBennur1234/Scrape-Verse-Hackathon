import { Radio, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSSE } from "@/hooks/use-sse";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { HowItWorksModal } from "@/components/dashboard/how-it-works-modal";

type Props = {
  reachable: boolean;
  sending: boolean;
  notice: string | null;
  noticeKind: "ok" | "error" | null;
  onSimulate: (scenario: string) => void;
};

export function Header({ reachable, sending, notice, noticeKind, onSimulate }: Props) {
  const { status } = useSSE();
  const sseLive = status === "open";
  const [watchdogEnabled, setWatchdogEnabled] = useState<boolean | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    apiFetch('/api/health')
      .then((res) => res.json())
      .then((data: unknown) => {
        if (data && typeof data === 'object' && 'watchdogEnabled' in data) {
          const enabled = (data as Record<string, unknown>).watchdogEnabled;
          if (typeof enabled === 'boolean') {
            setWatchdogEnabled(enabled);
          }
        }
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <header className="border-b border-border bg-card/35 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              <span>Into the Scrape-Verse</span>
              <span className="text-border">|</span>
              <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-sans font-semibold tracking-normal lowercase select-none">
                powered by Bright Data Scraper Studio (Self-Healing AI)
              </span>
            </div>
            <h1 className="font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Mandipulse
            </h1>
            <p className="mt-1.5 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Wholesale commodity market intelligence, automatically guarded and healed against scraper schema drift.
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
                <Radio className="size-3 animate-pulse" />
                {sseLive ? "Live Wire" : status === "error" ? "Reconnect" : "Connecting"}
              </Badge>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="secondary"
                onClick={() => setModalOpen(true)}
                className="flex-1 sm:flex-initial h-10 min-h-[40px] px-3 gap-1.5 border border-border bg-muted/40 hover:bg-muted text-foreground"
              >
                <HelpCircle className="size-4" />
                <span>Info</span>
              </Button>
              <select
                disabled={sending}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    onSimulate(val);
                    e.target.value = "";
                  }
                }}
                className="flex-1 sm:flex-initial h-10 min-h-[40px] px-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-md border-0 focus:outline-none cursor-pointer"
                value=""
              >
                <option value="" disabled hidden>
                  {sending ? "Replaying..." : "Simulate Scenario..."}
                </option>
                <option value="STALE_ARCHIVE_DATE" className="bg-card text-foreground text-xs">
                  Stale Date (real captured bug)
                </option>
                <option value="NULL_PRICE_SPIKE" className="bg-card text-foreground text-xs">
                  Null Price Spike (synthetic)
                </option>
                <option value="PRICE_OUTLIER_REJECTED" className="bg-card text-foreground text-xs">
                  Extreme Outlier (synthetic — watch it get rejected)
                </option>
              </select>
            </div>
          </div>
        </div>
        {notice && (
          <p
            className={`mx-auto max-w-6xl px-4 pb-3 font-mono text-xs sm:px-6 ${
              noticeKind === "error" ? "text-failed animate-shake" : "text-healthy animate-pulse"
            }`}
          >
            {notice}
          </p>
        )}
      </header>

      <HowItWorksModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
