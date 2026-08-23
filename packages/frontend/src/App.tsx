import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/dashboard/header";
import { PriceTicker } from "@/components/dashboard/price-ticker";
import { StatusCards } from "@/components/dashboard/status-cards";
import { MandiTable } from "@/components/dashboard/mandi-table";
import { PriceComparison } from "@/components/dashboard/price-comparison";
import { QuickInsights } from "@/components/dashboard/quick-insights";
import { InteractiveCharts } from "@/components/dashboard/interactive-charts";
import { HealingPipeline } from "@/components/dashboard/healing-pipeline";
import { HealingTerminal } from "@/components/dashboard/healing-terminal";
import { IncidentTimeline } from "@/components/dashboard/incident-timeline";
import { SSEProvider } from "@/hooks/sse-provider";
import { useSSE } from "@/hooks/use-sse";
import { useBoard } from "@/hooks/use-board";
import { apiFetch } from "@/lib/api";

function App() {
  return (
    <SSEProvider>
      <Dashboard />
    </SSEProvider>
  );
}

function Dashboard() {
  const board = useBoard();
  const { events } = useSSE({
    filter: (type) => type === "heal.recovered" || type === "heal.escalated" || type === "heal.graded",
  });
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<"ok" | "error" | null>(null);

  useEffect(() => {
    if (events.length === 0) return;
    const timer = setTimeout(() => void board.reload(), 700);
    return () => clearTimeout(timer);
  }, [events.length, board.reload]);

  const onSimulate = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setNotice(null);
    try {
      const response = await apiFetch("/api/simulate-drift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectorKey: "mumbai_apmc" }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        incidentId?: string;
        outcome?: string;
        gradeScore?: number;
        error?: string;
      };
      if (response.status === 429) {
        setNoticeKind("error");
        setNotice(body.error ?? "Rate limit exceeded. Please wait before trying again.");
        return;
      }
      if (response.status === 401) {
        setNoticeKind("error");
        setNotice("Unauthorized: Invalid or missing simulate key.");
        return;
      }
      if (!response.ok) {
        setNoticeKind("error");
        setNotice(body.error ?? `Request failed (${response.status})`);
        return;
      }
      const score =
        typeof body.gradeScore === "number" ? ` · grade ${body.gradeScore.toFixed(2)}` : "";
      setNoticeKind(body.outcome === "ESCALATED" ? "error" : "ok");
      setNotice(`Replay ${body.outcome ?? "done"}${score}`);
      void board.reload();
    } catch {
      setNoticeKind("error");
      setNotice("Could not reach the watchdog.");
    } finally {
      setSending(false);
    }
  }, [sending, board]);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-background">
      <Header
        reachable={board.reachable}
        sending={sending}
        notice={notice}
        noticeKind={noticeKind}
        onSimulate={() => void onSimulate()}
      />
      <PriceTicker prices={board.prices} />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <QuickInsights prices={board.prices} collectors={board.collectors} />
          <StatusCards collectors={board.collectors} prices={board.prices} loading={board.loading} />
          <MandiTable prices={board.prices} loading={board.loading} />
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <InteractiveCharts prices={board.prices} loading={board.loading} />
            <PriceComparison prices={board.prices} loading={board.loading} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <HealingPipeline />
          <HealingTerminal />
          <IncidentTimeline incidents={board.incidents} />
        </div>
      </main>
      <footer className="mt-auto border-t border-border py-4 bg-muted/20">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span>Mandipulse · Into the Scrape-Verse</span>
          <div className="flex items-center gap-4 font-mono text-[10px]">
            <a
              href="https://github.com/JeevanBennur1234/Scrape-Verse-Hackathon"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-foreground"
            >
              GitHub Repository
            </a>
            <span className="text-border">|</span>
            <a
              href="https://www.commodityonline.com/mandi-prices/maharashtra/mumbai"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-foreground"
            >
              CommodityOnline Source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
