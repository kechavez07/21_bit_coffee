/**
 * Subscribes to the most recent `sales` + `merma` docs and merges them into
 * a single feed for the Phase 4 movements history — the screen doesn't need
 * to know these are two separate collections.
 *
 * Same shape/posture as `useCatalog`: `loading` stays `true` until *both*
 * listeners have delivered their first snapshot, `error` is the first
 * Firestore error from either (whichever fires first).
 */
import { useEffect, useState } from 'react'
import type { FirestoreError } from 'firebase/firestore'
import {
  subscribeToMerma,
  subscribeToSales,
  type SaleRecord,
  type WasteRecord,
} from '../services/firebase/movements'

export type MovementEntry =
  | ({ type: 'sale' } & SaleRecord)
  | ({ type: 'waste' } & WasteRecord)

export interface UseMovementsResult {
  movements: MovementEntry[]
  loading: boolean
  error: Error | null
}

/** Newest-first, comparing raw Firestore `Timestamp`s (both docs share the same `timestamp` field type). */
function byTimestampDesc(a: MovementEntry, b: MovementEntry): number {
  const aMillis = toMillis(a.timestamp)
  const bMillis = toMillis(b.timestamp)
  return bMillis - aMillis
}

function toMillis(timestamp: unknown): number {
  if (
    timestamp &&
    typeof timestamp === 'object' &&
    'toMillis' in timestamp &&
    typeof (timestamp as { toMillis: unknown }).toMillis === 'function'
  ) {
    return (timestamp as { toMillis: () => number }).toMillis()
  }
  return 0
}

export function useMovements(limitCount = 50): UseMovementsResult {
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [waste, setWaste] = useState<WasteRecord[]>([])
  const [salesLoaded, setSalesLoaded] = useState(false)
  const [wasteLoaded, setWasteLoaded] = useState(false)
  const [error, setError] = useState<FirestoreError | null>(null)

  useEffect(() => {
    const unsubscribeSales = subscribeToSales(
      (next) => {
        setSales(next)
        setSalesLoaded(true)
      },
      (err) => setError((current) => current ?? err),
      limitCount,
    )

    const unsubscribeWaste = subscribeToMerma(
      (next) => {
        setWaste(next)
        setWasteLoaded(true)
      },
      (err) => setError((current) => current ?? err),
      limitCount,
    )

    return () => {
      unsubscribeSales()
      unsubscribeWaste()
    }
  }, [limitCount])

  const movements: MovementEntry[] = [
    ...sales.map((sale) => ({ type: 'sale' as const, ...sale })),
    ...waste.map((entry) => ({ type: 'waste' as const, ...entry })),
  ].sort(byTimestampDesc)

  return {
    movements,
    loading: !(salesLoaded && wasteLoaded),
    error,
  }
}
