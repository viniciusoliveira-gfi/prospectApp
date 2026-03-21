import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/claude'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  // Get sequence with steps
  const { data: sequence, error } = await supabase
    .from('sequences')
    .select('*, sequence_steps(*), campaigns(*)')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  const steps = (sequence.sequence_steps || []).sort(
    (a: { step_number: number }, b: { step_number: number }) => a.step_number - b.step_number
  )

  if (steps.length === 0) {
    return NextResponse.json({ error: 'Sequence has no steps' }, { status: 400 })
  }

  // Get all contacts for this campaign with prospect data
  const { data: contacts } = await supabase
    .from('contacts')
    .select('*, prospects(company_name, domain, ai_research, tier)')
    .eq('campaign_id', sequence.campaign_id)
    .eq('status', 'active')

  if (!contacts?.length) {
    return NextResponse.json({ error: 'No active contacts found' }, { status: 400 })
  }

  const generated: { contact_id: string; step_id: string; status: string }[] = []

  for (const contact of contacts) {
    const previousEmails: string[] = []

    for (const step of steps) {
      try {
        // Generate email body
        const body = await callClaude(
          `You are an expert cold email copywriter. Write concise, personalized cold emails that feel human and specific. Never use buzzwords or generic phrases. Reference specific details from research when available.`,
          `Write email ${step.step_number} of a ${steps.length}-step outreach sequence.

Recipient: ${contact.first_name} ${contact.last_name}, ${contact.title || 'Unknown Title'} at ${contact.prospects?.company_name || 'Unknown Company'}

Company research:
${contact.prospects?.ai_research || 'No research available'}

Step template/purpose: ${step.body_template}

${previousEmails.length > 0 ? `Previous emails in sequence:\n${previousEmails.join('\n---\n')}` : ''}

Rules:
- Keep it under 150 words
- No fluff, no buzzwords, no "I hope this finds you well"
- Reference specific details from the research if available
- Write ONLY the email body, no subject line
- Use a natural, conversational tone`,
          1000
        )

        // Generate subject line
        const subject = await callClaude(
          `You write compelling email subject lines. Short, specific, no clickbait.`,
          `Write a subject line (under 60 characters) for this cold email to ${contact.first_name} at ${contact.prospects?.company_name || 'their company'}:

${body}

Step template subject: ${step.subject_template}

Return ONLY the subject line, nothing else.`,
          100
        )

        // Save the email
        const { error: insertError } = await supabase.from('emails').insert({
          sequence_step_id: step.id,
          contact_id: contact.id,
          prospect_id: contact.prospect_id,
          subject: subject.trim().replace(/^["']|["']$/g, ''),
          body: body.trim(),
          approval_status: 'pending',
          send_status: 'queued',
        })

        if (insertError) {
          generated.push({ contact_id: contact.id, step_id: step.id, status: 'error' })
        } else {
          generated.push({ contact_id: contact.id, step_id: step.id, status: 'generated' })
          previousEmails.push(body.trim())
        }
      } catch {
        generated.push({ contact_id: contact.id, step_id: step.id, status: 'error' })
      }
    }
  }

  return NextResponse.json({
    total: generated.length,
    successful: generated.filter(g => g.status === 'generated').length,
    failed: generated.filter(g => g.status === 'error').length,
    results: generated,
  })
}
