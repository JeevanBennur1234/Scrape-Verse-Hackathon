import { X, HelpCircle, Cpu, Zap, LineChart, FileText } from "lucide-react";

export function HowItWorksModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative animate-in fade-in zoom-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close modal"
        >
          <X className="size-5" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-2.5 border-b border-border pb-4 mb-5">
            <HelpCircle className="size-6 text-blue-500" />
            <h2 id="modal-title" className="font-serif text-2xl font-semibold">How MandiPulse Works</h2>
          </div>

          <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
            <p>
              MandiPulse is built to solve a critical real-world problem for farmers and B2B traders: 
              <strong> web scraper fragility due to source site changes</strong>. By integrating 
              <strong> Bright Data Scraper Studio</strong> and an automated AI-driven healing watchdog, 
              MandiPulse repairs itself on the fly without developer intervention.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="bg-background/40 border border-border/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Zap className="size-4 text-amber-500" />
                  <span>1. Scraper Studio Ingestion</span>
                </div>
                <p className="text-xs">
                  We use Bright Data Scraper Studio's custom scrapers. Scrapers are created with simple natural language instructions to scrape public non-government directories like <em>CommodityOnline</em>.
                </p>
              </div>

              <div className="bg-background/40 border border-border/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Activity className="size-4 text-emerald-500" />
                  <span>2. Watchdog Anomaly Detector</span>
                </div>
                <p className="text-xs">
                  A scheduled background watchdog validates every scrape tick. It immediately flags errors if selectors return missing data (schema drift), empty records (null spikes), or highly fluctuating prices.
                </p>
              </div>

              <div className="bg-background/40 border border-border/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Cpu className="size-4 text-blue-500" />
                  <span>3. AI-Driven Self-Healing</span>
                </div>
                <p className="text-xs">
                  Upon incident detection, the healing engine triggers `bdata scraper heal` with the failure diagnosis. Scraper Studio's AI re-analyzes the page DOM, fixes the parsing selectors, and outputs a repaired preview.
                </p>
              </div>

              <div className="bg-background/40 border border-border/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <LineChart className="size-4 text-purple-500" />
                  <span>4. Grader Quality Gate</span>
                </div>
                <p className="text-xs">
                  The repair preview is scored by a grader: field presence (35%), type validity (25%), price sanity bounds (25%), and row count stability (15%). A score of ≥ 80% is required to approve the fix.
                </p>
              </div>
            </div>

            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex gap-3 items-start">
              <FileText className="size-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-foreground font-semibold text-xs uppercase tracking-wider font-mono">Zero-Downtime Deployment</h4>
                <p className="text-xs mt-1">
                  Once the grader approves the healed scraper preview, the system executes `bdata scraper approve` to deploy the scraper update to production immediately, preventing data loss or pipeline downtime.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border flex justify-end">
            <button
              onClick={onClose}
              className="rounded-lg bg-foreground text-background hover:bg-foreground/90 font-semibold text-xs px-4 py-2 transition-colors"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline helper for activity icon
function Activity(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
