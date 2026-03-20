import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/claude'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { prospect_id } = await request.json()

  if (!prospect_id) return NextResponse.json({ error: 'prospect_id required' }, { status: 400 })

  const { data: prospect, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', prospect_id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  if (!prospect.ai_research) {
    return NextResponse.json({ error: 'Prospect must be researched first' }, { status: 400 })
  }

  try {
    const result = await callClaude(
      `You are a sales qualification expert. Based on company research, assign a tier and provide rationale.`,
      `Based on this research about "${prospect.company_name}", qualify this prospect:

${prospect.ai_research}

Respond in exactly this JSON format (no other text):
{
  "tier": "tier_1" | "tier_2" | "tier_3" | "disqualified",
  "rationale": "2-3 sentence explanation"
}`,
      500
    )

    const parsed = JSON.parse(result)

    const { data } = await supabase
      .from('prospects')
      .update({
        tier: parsed.tier,
        qualification_rationale: parsed.rationale,
      })
      .eq('id', prospect_id)
      .select()
      .single()

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Qualification failed' }, { status: 500 })
  }
}
