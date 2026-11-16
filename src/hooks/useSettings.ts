import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

export interface AppSettings {
  organization?: { name?: string; school?: string; department?: string; receipt_footer?: string }
  regional?: { currency?: string; symbol?: string; timezone?: string }
  inventory?: { default_low_stock_threshold?: number }
  logos?: { slu?: string; gcs?: string; samcis?: string }
}

const EMPTY: AppSettings = {}

export function useSettings(): AppSettings {
  return useLiveQuery(
    async () => ((await db.kv.get('settings'))?.value as AppSettings | undefined) ?? EMPTY,
    [],
    EMPTY,
  )
}