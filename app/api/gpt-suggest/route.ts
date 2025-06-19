/**
 * GPT-4o Title Suggestion API route.
 * Accepts POST requests with { currentTitle: string, competitorTitles: string[], heroKeyword: string }.
 * Calls OpenAI GPT-4o to generate an optimized Amazon product title suggestion.
 * Returns a JSON object:
 *   {
 *     title: string,
 *     ctr_increase: string,
 *     cr_increase: string,
 *     justification: string,
 *     priority: "primary"
 *   }
 *
 * Example request body:
 *   {
 *     "currentTitle": "Old product title...",
 *     "competitorTitles": ["Best Seller 1...", "Best Seller 2..."],
 *     "heroKeyword": "hero keyword"
 *   }
 * Example response:
 *   {
 *     "title": "[Optimized title suggestion]",
 *     "ctr_increase": "[X]",
 *     "cr_increase": "[X]",
 *     "justification": "[Key reason this will outperform current title]",
 *     "priority": "primary"
 *   }
 */
import { NextRequest, NextResponse } from "next/server"
import { OpenAI } from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { currentTitle, competitorTitles, heroKeyword } = await req.json()
    if (!currentTitle || !Array.isArray(competitorTitles)) {
      return NextResponse.json({ error: "Missing currentTitle or competitorTitles" }, { status: 400 })
    }
    if (!heroKeyword) {
      return NextResponse.json({ error: "Missing heroKeyword" }, { status: 400 })
    }

    const prompt = `You are an expert Amazon listing optimizer. Given the current product title, the hero keyword, and a list of bestselling competitor titles, suggest 5 highly optimized product titles. Each suggestion should focus on optimizing a single aspect:

1. Conversion
2. Click-Through Rate (CTR)
3. Keyword Stuffing (SEO)
4. Marketing towards Gen Z
5. Marketing towards Boomers

Requirements:
- The hero keyword must always be included in each suggested title.
- If most competitor titles use the hero keyword near the front (within the first 5 words), place it more prominently (as close to the front as possible). Otherwise, you may keep it in its current place from the current title.
- For each suggestion, respond with a JSON object in the following format:
{
  "title": "[Optimized title suggestion]",
  "ctr_increase": "[X]",
  "cr_increase": "[X]",
  "justification": "[Key reason this will outperform current title]",
  "priority": "primary",
  "focus": "[Conversion|CTR|SEO|Gen Z|Boomers]"
}
- Respond ONLY with a JSON array of 5 such objects, one for each focus, in the order listed above. No extra commentary.

Current Title:\n${currentTitle}\n
Hero Keyword:\n${heroKeyword}\n
Bestselling Competitor Titles:\n${competitorTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n
Respond ONLY with the JSON array, no extra commentary.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    })

    const content = completion.choices[0].message.content?.trim() || "[]"
    console.log('[GPT-4o] Raw response content:', content)
    let result = []
    try {
      // Clean Markdown code block wrappers (```json ... ```) if present
      let cleanContent = content
        .replace(/^```json\s*/i, "") // Remove ```json at the start
        .replace(/^```/, "")           // Remove ``` at the start (if not labeled)
        .replace(/```$/, "")           // Remove ``` at the end
        .trim()
      result = JSON.parse(cleanContent)
    } catch {
      return NextResponse.json({ error: "Failed to parse GPT response" }, { status: 500 })
    }
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
} 