/**
 * Scheduling utilities for sequence operations.
 * Note: schedule calculation has moved to schedule-helpers.ts.
 * This file retains readiness checks and resume logic still used by sequence routes.
 */

/**
 * Check if all emails in a sequence are approved (or edited).
 * Returns { ready, total, approved, unapproved }.
 */
export function checkSequenceReadiness(
  emails: { approval_status: string }[]
): {
  ready: boolean
  total: number
  approved: number
  unapproved: number
} {
  const approved = emails.filter(
    e => e.approval_status === 'approved' || e.approval_status === 'edited'
  ).length
  const total = emails.length
  return {
    ready: total > 0 && approved === total,
    total,
    approved,
    unapproved: total - approved,
  }
}

/**
 * Recalculate schedules after a resume, shifting forward by pause duration.
 */
export function recalculateSchedulesAfterResume(
  emails: { id: string; scheduled_for: string | null }[],
  pausedAt: Date,
  resumedAt: Date
): { id: string; scheduled_for: string }[] {
  const pauseDurationMs = resumedAt.getTime() - pausedAt.getTime()

  return emails
    .filter(e => e.scheduled_for)
    .map(e => {
      const original = new Date(e.scheduled_for!)
      const shifted = new Date(original.getTime() + pauseDurationMs)
      return { id: e.id, scheduled_for: shifted.toISOString() }
    })
}
