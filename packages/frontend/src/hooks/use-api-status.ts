import { useEffect, useState } from 'react'

import { subscribeApiStatus } from '@/lib/api'

export type ApiStatus = 'unknown' | 'up' | 'down'

export function useApiStatus(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>('unknown')
  useEffect(() => subscribeApiStatus((reachable) => setStatus(reachable ? 'up' : 'down')), [])
  return status
}
