import { useCallback, useEffect, useState } from 'react'

import { Header } from '@/components/dashboard/header'
import { HealingTerminal } from '@/components/dashboard/healing-terminal'
import { IncidentTimeline } from '@/components/dashboard/incident-timeline'
import { MandiTable } from '@/components/dashboard/mandi-table'
import { PriceTicker } from '@/components/dashboard/price-ticker'
import { StatusCards } from '@/components/dashboard/status-cards'
import { BackendDownBanner } from '@/components/backend-down-banner'
import { apiFetch } from '@/lib/api'

type BackendHealth = 'checking' | 'ok' | 'down'

function useBackendHealth(): [BackendHealth, () => void] {
  const [health, setHealth] = useState<BackendHealth>('checking')

  const check = useCallback(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    apiFetch('/api/health', { signal: controller.signal, cache: 'no-store' })
      .then((response) => {
        if (!controller.signal.aborted) setHealth(response.ok ? 'ok' : 'down')
      })
      .catch(() => {
        if (!controller.signal.aborted) setHealth('down')
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [])

  useEffect(() => check(), [check])

  const retry = useCallback(() => {
    setHealth('checking')
    check()
  }, [check])

  return [health, retry]
}

function App() {
  const [health, retry] = useBackendHealth()

  if (health === 'down') return <BackendDownBanner onRetry={retry} />

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <PriceTicker />
      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 p-4 lg:grid-cols-[1fr_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          <StatusCards />
          <MandiTable />
        </div>
        <div className="flex min-h-0 flex-col gap-4">
          <HealingTerminal />
          <IncidentTimeline />
        </div>
      </main>
    </div>
  )
}

export default App
