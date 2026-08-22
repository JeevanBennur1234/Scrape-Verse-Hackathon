import type { IncidentRow } from "@/lib/api";
import { Badge, statusTone } from "@/components/ui/badge";
import { clock } from "@/lib/format";

export function IncidentTimeline({ incidents }: { incidents: IncidentRow[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)]">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-serif text-2xl font-medium">Incident ledger</h2>
        <p className="mt-1 text-sm text-muted-foreground">Latest grades from the watchdog.</p>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto p-3">
        {incidents.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">No incidents yet.</p>
        ) : (
          incidents.map((incident) => {
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
