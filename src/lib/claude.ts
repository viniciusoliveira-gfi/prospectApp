import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export function getClaudeClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 2000
): Promise<string> {
  const anthropic = getClaudeClient()
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })
  const block = response.content[0]
  if (block.type === 'text') return block.text
  return ''
}
