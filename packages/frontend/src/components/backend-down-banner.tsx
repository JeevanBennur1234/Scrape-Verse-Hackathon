import { Button } from '@/components/ui/button'
import { API_BASE_DISPLAY } from '@/lib/api'

export function BackendDownBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6 text-foreground">
      <div className="w-full max-w-lg rounded-xl border border-failed/40 bg-card p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-heartbeat rounded-full bg-failed" />
          <h1 className="text-lg font-bold tracking-tight">Backend unreachable</h1>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          The dashboard cannot reach the Mandipulse API, so live tables and the healing
          terminal have nothing to show. This is a configuration or availability issue,
          not missing data.
        </p>
        <dl className="mt-4 space-y-2 rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">api base:</dt>
            <dd className="break-all">{API_BASE_DISPLAY}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">fix:</dt>
            <dd className="break-all">
              set VITE_API_URL to your backend URL in Vercel project settings, then
              redeploy (Vite bakes it at build time)
            </dd>
          </div>
        </dl>
        <Button onClick={onRetry} className="mt-5 font-semibold">
          Retry connection
        </Button>
      </div>
    </div>
  )
}
