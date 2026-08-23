import { useState } from "react";
import { Info, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";

export function AboutPanel() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-panel)] transition-all duration-300">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors focus:outline-none"
      >
        <div className="flex items-center gap-2">
          <Info className="size-5 text-[var(--color-healing)]" />
          <h2 className="font-serif text-lg font-medium text-foreground">Project Scope & Hackathon Alignment</h2>
        </div>
        {isOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {isOpen && (
        <div className="p-4 pt-0 border-t border-border/50 text-xs text-muted-foreground space-y-4 animate-fade-in">
          {/* Project Summary */}
          <p className="leading-relaxed">
            MandiPulse is a wholesale agricultural intelligence platform equipped with automated watchdog surveillance. 
            Powered by Bright Data Scraper Studio, it features a self-healing pipeline that dynamically intercepts parsing drift, conducts grading checks, and deploys fixes.
          </p>

          <hr className="border-border/30" />

          {/* Honesty Section */}
          <div className="space-y-2">
            <h3 className="font-serif text-sm font-semibold text-foreground">Project Authenticity</h3>
            <p className="leading-relaxed">
              • The <strong>Mumbai Market</strong> collector (ID: <code className="text-foreground font-mono">c_mt364sxr1jxad1qpuy</code>) is <strong>fully real</strong> and live-scraped directly from CommodityOnline (a non-government market intelligence source, fully compliant with hackathon guidelines).
            </p>
            <p className="leading-relaxed">
              • The stale-date correction is a <strong>genuine captured repair</strong> of an actual parser drift bug resolved automatically by our self-healing watchdog.
            </p>
          </div>

          <hr className="border-border/30" />

          {/* Rubric Mapping List */}
          <div>
            <h3 className="font-serif text-sm font-semibold text-foreground mb-2">Hackathon Rubric Mapping</h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
              <li className="flex items-center gap-1.5 text-foreground">
                <CheckCircle2 className="size-3.5 text-[var(--color-healthy)] shrink-0" />
                <span>Real collector ✓</span>
              </li>
              <li className="flex items-center gap-1.5 text-foreground">
                <CheckCircle2 className="size-3.5 text-[var(--color-healthy)] shrink-0" />
                <span>Self-healing automation ✓</span>
              </li>
              <li className="flex items-center gap-1.5 text-foreground">
                <CheckCircle2 className="size-3.5 text-[var(--color-healthy)] shrink-0" />
                <span>Graded auto-approval ✓</span>
              </li>
              <li className="flex items-center gap-1.5 text-foreground">
                <CheckCircle2 className="size-3.5 text-[var(--color-healthy)] shrink-0" />
                <span>Fails safe on bad repairs ✓</span>
              </li>
              <li className="flex items-center gap-1.5 text-foreground">
                <CheckCircle2 className="size-3.5 text-[var(--color-healthy)] shrink-0" />
                <span>Production /dca/trigger integration ✓</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
