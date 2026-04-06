/**
 * Find the next valid send day from a given date.
 */
export function nextSendDay(
  from: Date,
  addDays: number,
  sendDays: string[],
  hoursStart: number
): Date {
  const target = new Date(from)
  target.setDate(target.getDate() + addDays)
  target.setHours(hoursStart, 0, 0, 0)
  let safety = 0
  while (!sendDays.includes(String(target.getDay())) && safety < 7) {
    target.setDate(target.getDate() + 1)
    safety++
  }
  return target
}

/**
 * Get a date key for capacity tracking.
 */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/**
 * Get current time in a specific timezone.
 */
export function getTimezoneNow(timezone: string): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
}

/**
 * Clamp a date to tomorrow if it's in the past.
 */
export function clampToFuture(d: Date, tomorrow: Date): Date {
  return d < tomorrow ? new Date(tomorrow) : d
}
