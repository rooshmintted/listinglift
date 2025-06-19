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
Check the following product title for spelling mistakes. 
For each misspelled word, return a JSON array with:
- word: the misspelled word
- start: start index in the string
- end: end index (exclusive)
- suggestion: the correct spelling

Text: "${text}"

Respond ONLY with a JSON array, e.g.:
[{"word":"teh","start":5,"end":8,"suggestion":"the"}]
If there are no mistakes, return [].
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
  } catch {
    result = []
  }
  return NextResponse.json(result)
}
