import { useMemo } from "react";
import { useSSE } from "@/hooks/use-sse";
import { clock } from "@/lib/format";
import type { SseEvent } from "@/lib/api";

const HEAL = (type: string) =>
  type.startsWith("heal.") || type === "incident.simulated" || type === "drift.simulated";

type Trace = {
  incidentId: string;
  simulated?: boolean;
  events: SseEvent[];
};

function tracesFrom(events: SseEvent[]): Trace[] {
  const map = new Map<string, Trace>();
  for (const event of events) {
    const payload = event.payload;
    const incidentId = String(payload.incidentId ?? "");
    if (!incidentId) continue;
    const trace = map.get(incidentId) ?? { incidentId, events: [] };
    trace.events.push(event);
    if (payload.simulated === true) trace.simulated = true;
    map.set(incidentId, trace);
  }
  return [...map.values()].reverse();
}

function lineFor(event: SseEvent): { text: string; className: string } | null {
  const p = event.payload;
  switch (event.type) {
    case "incident.simulated":
    case "drift.simulated":
      return { text: "Drift detected on the Mumbai board", className: "text-simulated" };
    case "heal.started":
      return { text: "Heal started", className: "text-healing" };
    case "heal.cli.started":
      return { text: "bdata scraper heal", className: "text-healing" };
    case "heal.cli.completed":
      return { text: "Repair preview ready", className: "text-healthy" };
    case "heal.graded":
      return {
        text: `Grade ${String(p.score)} ${p.approved ? "PASS" : "FAIL"}`,
        className: p.approved ? "text-healthy" : "text-failed",
      };
    case "heal.recovered":
      return { text: "Recovered — collector restored", className: "text-healthy" };
    case "heal.escalated":
      return { text: `Escalated — ${String(p.reason ?? "grade failed")}`, className: "text-failed" };
    default:
      return null;
  }
}

export function HealingTerminal() {
  const { events, status } = useSSE({
    filter: (type) => HEAL(type),
  });
  const traces = useMemo(() => tracesFrom(events), [events]);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-serif text-2xl font-medium">Heal telegraph</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {status === "open" ? "Live wire" : status === "error" ? "Reconnecting" : "Opening"}
        </span>
      </div>
      <div className="h-80 overflow-y-auto bg-background/40 p-4 font-mono text-xs leading-relaxed">
        {traces.length === 0 ? (
          <p className="text-muted-foreground text-center py-20">
            Click ⚡ Simulate Drift to watch DETECT → HEAL → GRADE → RECOVERED.
          </p>
        ) : (
          traces.map((trace) => (
            <article key={trace.incidentId} className="mb-5 border-l border-border pl-3 last:mb-0">
              <div className="mb-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {trace.simulated && <span className="text-simulated">Simulated</span>}
                <span>{trace.incidentId.slice(0, 8)}</span>
              </div>
              {trace.events.map((event) => {
                const line = lineFor(event);
                if (!line) return null;
                return (
                  <p key={event.id} className={`flex gap-2 ${line.className}`}>
                    <span className="shrink-0 text-muted-foreground">{clock(event.timestamp)}</span>
                    <span>{line.text}</span>
                  </p>
                );
              })}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
