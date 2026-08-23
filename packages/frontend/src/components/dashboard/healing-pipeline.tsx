import { useMemo } from "react";
import { useSSE } from "@/hooks/use-sse";
import { ShieldAlert, Cpu, CheckCircle2, AlertTriangle, Activity, ArrowRight, ArrowDown } from "lucide-react";

type Stage = "ingest" | "anomaly" | "heal" | "verify" | "recovered" | "escalated";

export function HealingPipeline() {
  const { events } = useSSE({
    filter: (type) =>
      type.startsWith("heal.") ||
      type === "incident.simulated" ||
      type === "drift.simulated",
  });

  // Calculate the current active stage in the pipeline
  const activeStage = useMemo<Stage>(() => {
    if (events.length === 0) return "ingest";
    
    // Sort events by timestamp desc to get the freshest one
    const sorted = [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const latest = sorted[0];

    // If the latest event is older than 20 seconds and it was a final state (recovered/escalated), reset to ingest
    const elapsed = Date.now() - new Date(latest.timestamp).getTime();
    if (elapsed > 20000 && (latest.type === "heal.recovered" || latest.type === "heal.escalated" || latest.type === "heal.failed")) {
      return "ingest";
    }

    switch (latest.type) {
      case "drift.simulated":
      case "incident.simulated":
        return "anomaly";
      case "heal.started":
      case "heal.cli.started":
        return "heal";
      case "heal.cli.completed":
      case "heal.graded":
      case "heal.repair.graded":
        return "verify";
      case "heal.recovered":
        return "recovered";
      case "heal.escalated":
      case "heal.failed":
        return "escalated";
      default:
        return "ingest";
    }
  }, [events]);

  const stagesDef = [
    {
      id: "ingest",
      name: "1. Crawler Ingest",
      icon: Activity,
      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
      activeColor: "bg-emerald-500 border-emerald-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)] animate-pulse",
      desc: "Bright Data Scraper Studio crawling source website",
    },
    {
      id: "anomaly",
      name: "2. Anomaly Detect",
      icon: ShieldAlert,
      color: "text-amber-500 bg-amber-500/10 border-amber-500/30",
      activeColor: "bg-amber-500 border-amber-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-bounce",
      desc: "Watchdog catches schema drift or pricing outliers",
    },
    {
      id: "heal",
      name: "3. AI Diagnostics",
      icon: Cpu,
      color: "text-blue-500 bg-blue-500/10 border-blue-500/30",
      activeColor: "bg-blue-500 border-blue-400 text-black shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse",
      desc: "Bright Data scraper heal repairs parser rules",
    },
    {
      id: "verify",
      name: "4. Repair / Grader",
      icon: CheckCircle2,
      color: "text-purple-500 bg-purple-500/10 border-purple-500/30",
      activeColor: "bg-purple-500 border-purple-400 text-black shadow-[0_0_15px_rgba(168,85,247,0.5)] animate-pulse",
      desc: "Grader checks data bounds, integrity, & row stability",
    },
    {
      id: "recovered",
      name: "5. Restored & Deployed",
      icon: CheckCircle2,
      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
      activeColor: "bg-emerald-500 border-emerald-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.7)]",
      desc: "Approved scraper updates deployed with zero downtime",
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)] p-4">
      <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
        <div>
          <h2 className="font-serif text-xl font-medium">Scraper Self-Healing Pipeline</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Bright Data AI resilience loop in action</p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          {activeStage === "ingest" ? "Healthy (Monitoring)" : "Self-Healing Loop Active"}
        </span>
      </div>

      <div className="flex flex-col md:flex-row md:items-stretch items-center gap-3 relative w-full">
        {stagesDef.map((stage, idx) => {
          const Icon = stage.id === "recovered" && activeStage === "escalated" ? AlertTriangle : stage.icon;
          const isCurrent = activeStage === stage.id || (stage.id === "recovered" && activeStage === "escalated");
          
          let cardStyle = stage.color;
          if (isCurrent) {
            cardStyle = activeStage === "escalated" ? "bg-rose-500 border-rose-400 text-black shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse" : stage.activeColor;
          }

          const stageName = stage.id === "recovered" && activeStage === "escalated" ? "5. Escalated (Fail)" : stage.name;
          const stageDesc = stage.id === "recovered" && activeStage === "escalated" ? "Scraper failed checks and requires developer override." : stage.desc;

          return (
            <div key={stage.id} className="flex flex-col md:flex-row items-center gap-3 z-10 w-full md:w-auto md:flex-1">
              <div className={`w-full border rounded-lg p-3 transition-all duration-300 ${cardStyle} min-h-[90px] flex flex-col justify-center`}>
                <div className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0" />
                  <span className="font-mono text-xs font-bold leading-none">{stageName}</span>
                </div>
                <p className={`text-[10px] mt-1.5 leading-snug ${isCurrent ? "text-black/80 dark:text-black/80 font-medium" : "text-muted-foreground"}`}>
                  {stageDesc}
                </p>
              </div>

              {idx < stagesDef.length - 1 && (
                <>
                  {/* Desktop arrow */}
                  <div className="hidden md:flex text-muted-foreground/30 shrink-0">
                    <ArrowRight className="size-4" />
                  </div>
                  {/* Mobile arrow */}
                  <div className="flex md:hidden text-muted-foreground/30 shrink-0 my-1">
                    <ArrowDown className="size-4" />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
