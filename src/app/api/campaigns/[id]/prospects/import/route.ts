import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) return NextResponse.json({ error: 'CSV must have headers and at least one row' }, { status: 400 })

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''))

    const nameIdx = headers.findIndex(h => h === 'company_name' || h === 'company' || h === 'name')
    if (nameIdx === -1) return NextResponse.json({ error: 'CSV must have a company_name or company column' }, { status: 400 })

    const domainIdx = headers.findIndex(h => h === 'domain' || h === 'website_domain')
    const websiteIdx = headers.findIndex(h => h === 'website' || h === 'url')
    const countryIdx = headers.findIndex(h => h === 'country' || h === 'location')
    const sizeIdx = headers.findIndex(h => h === 'size' || h === 'employees' || h === 'company_size')
    const industryIdx = headers.findIndex(h => h === 'industry' || h === 'sector')

    const prospects = []
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i])
      const companyName = cols[nameIdx]?.trim()
      if (!companyName) continue

      prospects.push({
        campaign_id: params.id,
        company_name: companyName,
        domain: domainIdx >= 0 ? cols[domainIdx]?.trim() || null : null,
        website: websiteIdx >= 0 ? cols[websiteIdx]?.trim() || null : null,
        country: countryIdx >= 0 ? cols[countryIdx]?.trim() || null : null,
        size: sizeIdx >= 0 ? cols[sizeIdx]?.trim() || null : null,
        industry: industryIdx >= 0 ? cols[industryIdx]?.trim() || null : null,
      })
    }

    if (prospects.length === 0) return NextResponse.json({ error: 'No valid prospects found in CSV' }, { status: 400 })

    const { data, error } = await supabase
      .from('prospects')
      .insert(prospects)
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ imported: data.length, prospects: data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to parse CSV' }, { status: 400 })
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}
