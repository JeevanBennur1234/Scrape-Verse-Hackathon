import { useMemo } from "react";
import type { IncidentRow } from "@/lib/api";
import { Badge, statusTone } from "@/components/ui/badge";
import { clock } from "@/lib/format";

const DEMO_INCIDENT: IncidentRow = {
  id: "demo-incident-success-9f3b",
  collectorId: "c_mt364sxr1jxad1qpuy",
  type: "SCHEMA_DRIFT",
  field: "report_date",
  symptom: "Scraper schema drift detected (stale archive date 2026-08-03 on Mumbai board)",
  affectedRatio: 1.0,
  status: "RECOVERED",
  simulated: true,
  createdAt: new Date().toISOString(),
  collector: { name: "Mumbai Market" },
  grades: [
    {
      id: "demo-grade-s1",
      score: 0.96,
      reason: "Grade passed: score 0.96 >= 0.80 (all validation gates passed, calling scraper approve)",
      createdAt: new Date().toISOString()
    }
  ]
};

export function IncidentTimeline({ incidents }: { incidents: IncidentRow[] }) {
  const displayIncidents = useMemo(() => {
    return [DEMO_INCIDENT, ...incidents];
  }, [incidents]);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)]">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-serif text-2xl font-medium">Incident ledger</h2>
        <p className="mt-1 text-sm text-muted-foreground">Latest grades from the watchdog.</p>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto p-3">
        {displayIncidents.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">No incidents yet.</p>
        ) : (
          displayIncidents.map((incident) => {
            const grade = incident.grades[0];
            const simulated =
              incident.simulated ||
              incident.symptom.includes("[SIMULATED]") ||
              incident.symptom.includes("Simulated");
            return (
              <article key={incident.id} className="rounded-lg border border-border px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{incident.type.replaceAll("_", " ")}</Badge>
                  <Badge tone={statusTone(incident.status)}>{incident.status}</Badge>
                  {simulated && <Badge tone="simulated">Simulated</Badge>}
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
                    {clock(incident.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-snug">{incident.symptom}</p>
                {grade && (
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    Grade {grade.score.toFixed(2)} · {grade.reason}
                  </p>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
