import { Header } from '@/components/dashboard/header'
import { HealingTerminal } from '@/components/dashboard/healing-terminal'
import { IncidentTimeline } from '@/components/dashboard/incident-timeline'
import { MandiTable } from '@/components/dashboard/mandi-table'
import { PriceTicker } from '@/components/dashboard/price-ticker'
import { StatusCards } from '@/components/dashboard/status-cards'

function App() {
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
