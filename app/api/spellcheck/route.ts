/**
 * Spellcheck API route for product titles.
 * Accepts { text: string } and returns [{ word, start, end, suggestion }]
 * Uses OpenAI GPT-3.5-turbo for spellchecking.
 *
 * Example request body:
 *   { "text": "Ths is a smple title" }
 * Example response:
 *   [
 *     { "word": "Ths", "start": 0, "end": 3, "suggestion": "This" },
 *     { "word": "smple", "start": 9, "end": 14, "suggestion": "simple" }
 *   ]
 */
import { NextRequest, NextResponse } from "next/server"
import { OpenAI } from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text) return NextResponse.json([], { status: 200 })

  const prompt = `
Check the following product title for actual spelling mistakes that need correction.

IMPORTANT RULES:
- Only return words that are genuinely misspelled (wrong spelling)
- Do NOT return suggestions where the word and suggestion are identical
- Do NOT suggest changes for correctly spelled words, proper nouns, or brand names
- Do NOT suggest changes for stylistic preferences or grammar issues
- Focus only on clear spelling errors

For each genuinely misspelled word, return a JSON array with:
- word: the exact misspelled word as it appears
- start: start index in the string (inclusive)
- end: end index in the string (exclusive)
- suggestion: the correct spelling (must be different from the original word)

Text: "${text}"

Examples of what TO include:
- "teh" → "the"
- "recieve" → "receive" 
- "seperate" → "separate"

Examples of what NOT to include:
- "don't" → "don't" (identical)
- "iPhone" → "iphone" (brand name)
- "WiFi" → "Wi-Fi" (stylistic)

Respond ONLY with a JSON array. If no spelling mistakes exist, return [].
  `.trim()

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  })

  // Parse the JSON from the response
  const content = completion.choices[0].message.content?.trim() || "[]"
  let result = []
  try {
    result = JSON.parse(content)
    
    // Filter out nonsensical suggestions where word and suggestion are identical
    result = result.filter((error: any) => {
      if (!error.word || !error.suggestion) return false
      if (error.word === error.suggestion) {
        console.log("Filtered out identical suggestion:", error)
        return false
      }
      return true
    })
  } catch {
    result = []
  }
  return NextResponse.json(result)
}
