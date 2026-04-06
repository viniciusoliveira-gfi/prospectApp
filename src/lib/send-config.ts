import { createAdminClient } from '@/lib/supabase/admin'

export interface ResolvedSendConfig {
  senderAccounts: string[]
  dailyLimitPerAccount: number
  sendDays: string[]
  hoursStart: number
  hoursEnd: number
  timezone: string
  trackOpens: boolean
  dailyCapacity: number
  signature: string | null
}

export async function resolveSendingConfig(campaignId?: string): Promise<ResolvedSendConfig> {
  const supabase = createAdminClient()

  // Load global defaults
  const { data: globalSettings } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'sending_defaults')
    .single()

  const g = (globalSettings?.value || {}) as Record<string, string>

  // Defaults from global settings
  let senderAccounts: string[] = []
  let dailyLimitPerAccount = parseInt(g.daily_limit_per_account || g.daily_limit || '25')
  let sendDays: string[] = g.send_days ? JSON.parse(g.send_days) : ['1', '2', '3', '4', '5']
  let hoursStart = parseInt(g.hours_start || '9')
  let hoursEnd = parseInt(g.hours_end || '18')
  let timezone = g.timezone || 'America/Sao_Paulo'
  let trackOpens = true
  let signature: string | null = null

  // Override with campaign settings if provided
  if (campaignId) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('send_settings, sending_account')
      .eq('id', campaignId)
      .single()

    if (campaign) {
      const ss = (campaign.send_settings || {}) as Record<string, unknown>

      if (Array.isArray(ss.sender_accounts) && ss.sender_accounts.length) {
        senderAccounts = ss.sender_accounts as string[]
      } else if (campaign.sending_account) {
        senderAccounts = [campaign.sending_account]
      }

      if (typeof ss.daily_limit_per_account === 'number') dailyLimitPerAccount = ss.daily_limit_per_account
      if (Array.isArray(ss.send_days) && ss.send_days.length) sendDays = ss.send_days as string[]
      if (typeof ss.send_hours_start === 'number') hoursStart = ss.send_hours_start
      if (typeof ss.send_hours_end === 'number') hoursEnd = ss.send_hours_end
      if (typeof ss.timezone === 'string' && ss.timezone) timezone = ss.timezone
      if (typeof ss.track_opens === 'boolean') trackOpens = ss.track_opens
      if (typeof ss.signature === 'string') signature = ss.signature
    }
  }

  // If no sender accounts configured, get primary Gmail account
  if (!senderAccounts.length) {
    const { data: gmailData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'gmail_tokens')
      .single()

    if (gmailData?.value) {
      const tokens = gmailData.value as { email?: string }
      if (tokens.email) senderAccounts = [tokens.email]
    }
  }

  if (!senderAccounts.length) senderAccounts = ['_default']

  return {
    senderAccounts,
    dailyLimitPerAccount,
    sendDays,
    hoursStart,
    hoursEnd,
    timezone,
    trackOpens,
    dailyCapacity: senderAccounts.length * dailyLimitPerAccount,
    signature,
  }
}
