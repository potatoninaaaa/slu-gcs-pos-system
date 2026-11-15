import { db } from '../db/db'
import { newId } from './id'

// Saves an audit entry on this device and queues it for the cloud.
export async function logActivity(
  userId: string,
  action: string,
  entityType: string | null,
  entityId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  if (!userId) return
  const created_at = new Date().toISOString()
  const row = {
    id: newId(),
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
    created_at,
  }
  await db.transaction('rw', db.logs, db.outbox, async () => {
    await db.logs.add({ ...row, sync_status: 'pending' })
    await db.outbox.add({
      id: newId(),
      type: 'activity_log',
      payload: row,
      created_at,
      attempts: 0,
    })
  })
}