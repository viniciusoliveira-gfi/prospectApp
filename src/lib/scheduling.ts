/**
 * Scheduling logic for sequence email delivery.
 * Calculates when each step's emails should be sent based on
 * start time, delay_days, and sending hours window.
 */

import { GMAIL_LIMITS } from '@/lib/gmail'

export interface ScheduleParams {
  startTime: Date
  delayDays: number
  hoursStart?: number
  hoursEnd?: number
}

/**
 * Calculate the scheduled send time for an email.
 * - Step 1 (delay_days=0): sends at startTime if within sending hours,
 *   otherwise next day at hoursStart.
 * - Step N: startTime + delay_days, at hoursStart of that day.
 */
export function calculateScheduledFor({
  startTime,
  delayDays,
  hoursStart = GMAIL_LIMITS.sendingHoursStart,
  hoursEnd = GMAIL_LIMITS.sendingHoursEnd,
}: ScheduleParams): Date {
  const scheduled = new Date(startTime)

  if (delayDays === 0) {
    // First step: send now if within hours, otherwise next day at start
    const hour = scheduled.getHours()
    if (hour < hoursStart || hour >= hoursEnd) {
      // Outside sending hours — schedule for next day at start
      scheduled.setDate(scheduled.getDate() + 1)
      scheduled.setHours(hoursStart, 0, 0, 0)
    }
    return scheduled
  }

  // Future steps: add delay_days to start date, send at hoursStart
  scheduled.setDate(scheduled.getDate() + delayDays)
  scheduled.setHours(hoursStart, 0, 0, 0)
  return scheduled
}

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
