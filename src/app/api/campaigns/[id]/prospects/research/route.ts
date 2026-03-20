import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/claude'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const body = await request.json()

  // Get prospects to research (either specific IDs or all pending)
  let query = supabase
    .from('prospects')
    .select('*')
    .eq('campaign_id', params.id)

  if (body.prospect_ids?.length > 0) {
    query = query.in('id', body.prospect_ids)
  } else {
    query = query.in('ai_research_status', ['pending', 'failed'])
  }

  const { data: prospects, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!prospects?.length) return NextResponse.json({ message: 'No prospects to research' })

  // Mark all as researching
  await supabase
    .from('prospects')
    .update({ ai_research_status: 'researching' })
    .in('id', prospects.map(p => p.id))

  // Process research in background (don't await all — return immediately)
  const results: { id: string; status: string }[] = []

  // Process sequentially to avoid rate limits
  for (const prospect of prospects) {
    try {
      const research = await callClaude(
        `You are a business research analyst. Research the given company and provide a structured analysis. Be specific and factual. If you don't have information, say so rather than making things up.`,
        `Research "${prospect.company_name}" (${prospect.domain || 'no domain provided'}). Return your analysis in this exact format:

## What They Do
[2 sentences about their core business]

## Target Customers
[Who they sell to / serve]

## Company Size & Growth
[Employee count if known, funding, growth signals]

## Key Decision Makers
[Likely titles of decision makers: CEO, CTO, VP of X, etc.]

## Potential Pain Points
[Why they might need outbound sales/prospecting tools — specific pain points]

## Recent News
[Any recent developments, funding rounds, product launches, or news]

## Recommended Tier
[Tier 1 (high fit), Tier 2 (medium fit), or Tier 3 (low fit)]

## Qualification Rationale
[2-3 sentences explaining the tier recommendation]`,
        2000
      )

      // Extract tier from research
      const tierMatch = research.match(/Recommended Tier[:\s]*\n?\s*(?:Tier\s*)?(\d)/i)
      const tier = tierMatch ? `tier_${tierMatch[1]}` : null

      // Extract rationale
      const rationaleMatch = research.match(/Qualification Rationale[:\s]*\n?([\s\S]*?)(?:\n##|$)/i)
      const rationale = rationaleMatch ? rationaleMatch[1].trim() : null

      await supabase
        .from('prospects')
        .update({
          ai_research: research,
          ai_research_status: 'completed',
          tier: tier,
          qualification_rationale: rationale,
        })
        .eq('id', prospect.id)

      results.push({ id: prospect.id, status: 'completed' })
    } catch {
      await supabase
        .from('prospects')
        .update({ ai_research_status: 'failed' })
        .eq('id', prospect.id)

      results.push({ id: prospect.id, status: 'failed' })
    }
  }

  return NextResponse.json({ results })
}
