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

  await supabase
    .from('prospects')
    .update({ ai_research_status: 'researching' })
    .eq('id', prospect_id)

  try {
    const research = await callClaude(
      `You are a business research analyst. Research the given company and provide a structured analysis. Be specific and factual.`,
      `Research "${prospect.company_name}" (${prospect.domain || 'no domain provided'}). Return your analysis in this exact format:

## What They Do
[2 sentences about their core business]

## Target Customers
[Who they sell to / serve]

## Company Size & Growth
[Employee count if known, funding, growth signals]

## Key Decision Makers
[Likely titles of decision makers]

## Potential Pain Points
[Specific pain points relevant to prospecting]

## Recent News
[Recent developments]

## Recommended Tier
[Tier 1 (high fit), Tier 2 (medium fit), or Tier 3 (low fit)]

## Qualification Rationale
[2-3 sentences]`,
      2000
    )

    const tierMatch = research.match(/Recommended Tier[:\s]*\n?\s*(?:Tier\s*)?(\d)/i)
    const tier = tierMatch ? `tier_${tierMatch[1]}` : null

    const rationaleMatch = research.match(/Qualification Rationale[:\s]*\n?([\s\S]*?)(?:\n##|$)/i)
    const rationale = rationaleMatch ? rationaleMatch[1].trim() : null

    const { data } = await supabase
      .from('prospects')
      .update({
        ai_research: research,
        ai_research_status: 'completed',
        tier,
        qualification_rationale: rationale,
      })
      .eq('id', prospect_id)
      .select()
      .single()

    return NextResponse.json(data)
  } catch {
    await supabase
      .from('prospects')
      .update({ ai_research_status: 'failed' })
      .eq('id', prospect_id)

    return NextResponse.json({ error: 'Research failed' }, { status: 500 })
  }
}
