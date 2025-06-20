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

async function POST(req: NextRequest) {
  try {
    const { currentTitle, competitorTitles, heroKeyword } = await req.json()
    if (!currentTitle || !Array.isArray(competitorTitles)) {
      return NextResponse.json({ error: "Missing currentTitle or competitorTitles" }, { status: 400 })
    }
    if (!heroKeyword) {
      return NextResponse.json({ error: "Missing heroKeyword" }, { status: 400 })
    }

    const prompt = `You are an expert Amazon listing optimizer. Given the current product title, the hero keyword, and a list of bestselling competitor titles, suggest 5 highly optimized product titles. Each suggestion should focus on optimizing a single aspect: Keyword Stuffing (SEO) 

Requirements:
- The hero keyword must always be included in each suggested title.
- If most competitor titles use the hero keyword near the front (within the first 5 words), place it more prominently (as close to the front as possible). Otherwise, you may keep it in its current place from the current title. You are being given the top competitor titles, so make sure to include keywords that are in the top competitor titles in some of your suggestions.
- For each suggestion, respond with a JSON object in the following format:
{
  "title": "[Optimized title suggestion]",
  "ctr_increase": "[X]",
  "cr_increase": "[X]",
  "justification": "[Key reason this will outperform current title]",
  "priority": "primary",
  "focus": "SEO"
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

/**
 * Keyword Gap Analysis API route.
 * Accepts POST requests with { currentTitle: string, competitorTitles: string[] }.
 * Calls OpenAI GPT-4o to extract meaningful keywords from competitor titles, compare with our title, and identify gaps.
 * Returns a JSON object:
 *   {
 *     missing_keywords: [
 *       {
 *         keyword: string,
 *         frequency: number,
 *         competitors_using: string[],
 *         category: string,
 *         priority: "high" | "medium" | "low"
 *       }
 *     ],
 *     our_existing_keywords: string[],
 *     high_value_gaps: string[]
 *   }
 */
async function POST_keyword_gap(req: NextRequest) {
  try {
    const { currentTitle, competitorTitles } = await req.json()
    if (!currentTitle || !Array.isArray(competitorTitles)) {
      return NextResponse.json({ error: "Missing currentTitle or competitorTitles" }, { status: 400 })
    }

    const prompt = `You are a keyword gap analysis expert. Extract meaningful keywords from competitor titles and identify what our title is missing.\nInput Data:\n\nOur Current Title: ${currentTitle}\nCompetitor Titles: ${competitorTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nStep 1: Extract meaningful keywords from competitor titles using these criteria:\nINCLUDE as meaningful keywords:\n\nProduct descriptors: Primary product terms (matcha, powder, tea, blend)\nQuality indicators: Premium, superior, authentic, pure, organic, natural\nCertifications/Standards: USDA, JAS, FDA approved, certified, grade A\nFunctional benefits: Energy, antioxidant, ceremonial, culinary, barista\nPackaging/Size details: 100g, 3.5oz, tin, resealable, bulk\nGeographic/Origin: Japanese, Uji, Kyoto, imported, grown in\nUse case keywords: Latte, smoothie, baking, cooking, drinking\nTarget audience: Professional, home, kitchen, cafe grade\nProcess/Method: Stone ground, shade grown, first harvest, traditional\nProduct variants: Unsweetened, sugar-free, instant, concentrate\n\nEXCLUDE as non-meaningful:\n\nCommon articles/prepositions: the, and, or, for, with, from, by\nGeneric qualifiers: best, great, amazing, perfect (unless part of specific phrase)\nFiller words: your, our, this, that, new, fresh\nBrand names: Naoki, Chaism, AprikaLife, non dictionary words (focus on descriptive terms)\nGeneric containers: bag, container, package (including size-specific)\n\nPHRASE EXTRACTION:\n\nMulti-word phrases: "ceremonial grade", "first harvest", "stone ground"\nBenefit phrases: "perfect for lattes", "ideal for baking"\nQuality phrases: "premium quality", "authentic Japanese"\n\nStep 2: Compare against our title and identify gaps\nOutput Format (JSON):\njson{\n  "missing_keywords": [\n    {\n      "keyword": "premium",\n      "frequency": 3,\n      "competitors_using": ["Competitor 1", "Competitor 2"],\n      "category": "quality_indicator",\n      "priority": "high"\n    }\n  ],\n  "our_existing_keywords": ["organic", "matcha", "powder"],\n  "high_value_gaps": ["ceremonial", "premium", "japanese"]\n}\nPrioritization: Mark as high priority if keyword appears in 2+ competitor titles and represents searchable product attributes or customer needs.\nRespond ONLY with the JSON object, no extra commentary.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    })

    const content = completion.choices[0].message.content?.trim() || "{}"
    console.log('[GPT-4o] Keyword Gap Raw response content:', content)
    let result = {}
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

/**
 * Bullet Point Keyword Gap Analysis API route.
 * Accepts POST requests with { currentBullets: string[], competitorBullets: string[][] }.
 * Calls OpenAI GPT-4o to extract meaningful keywords from competitor bullet points, compare with ours, and identify gaps.
 * Returns a JSON object:
 *   {
 *     missing_keywords: [...],
 *     our_existing_keywords: [...],
 *     high_value_gaps: [...]
 *   }
 */
async function POST_bullet_gap(req: NextRequest) {
  try {
    const { currentBullets, competitorBullets } = await req.json()
    if (!Array.isArray(currentBullets) || !Array.isArray(competitorBullets)) {
      return NextResponse.json({ error: "Missing currentBullets or competitorBullets" }, { status: 400 })
    }
    const prompt = `You are a keyword gap analysis expert. Extract meaningful keywords from competitor bullet points and identify what our bullet points are missing.\nInput Data:\n\nOur Bullet Points:\n${currentBullets.map((b: string, i: number) => `${i + 1}. ${b}`).join("\n")}\nCompetitor Bullet Points:\n${competitorBullets.map((arr: string[], idx: number) => `Competitor ${idx + 1}:\n${arr.map((b: string, i: number) => `${i + 1}. ${b}`).join("\n")}`).join("\n\n")}\n\nStep 1: Extract meaningful keywords from all competitor bullet points using these criteria (same as for titles, but applied to bullet points).\nStep 2: Compare against our bullet points and identify gaps.\nOutput Format (JSON):\njson{\n  \"missing_keywords\": [\n    {\n      \"keyword\": \"premium\",\n      \"frequency\": 3,\n      \"competitors_using\": [\"Competitor 1\", \"Competitor 2\"],\n      \"category\": \"quality_indicator\",\n      \"priority\": \"high\"\n    }\n  ],\n  \"our_existing_keywords\": [\n    ...\n  ],\n  \"high_value_gaps\": [\n    ...\n  ]\n}\nPrioritization: Mark as high priority if keyword appears in 2+ competitors and represents searchable product attributes or customer needs.\nRespond ONLY with the JSON object, no extra commentary.`
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    })
    const content = completion.choices[0].message.content?.trim() || "{}"
    let result = {}
    try {
      let cleanContent = content
        .replace(/^```json\s*/i, "")
        .replace(/^```/, "")
        .replace(/```$/, "")
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

/**
 * Bullet Point Idea Generation API route.
 * Accepts POST requests with { competitorBullets: string[] }.
 * Calls OpenAI GPT-4o to generate 10 creative bullet point ideas based on competitor bullet points.
 * Returns a JSON array of strings.
 */
async function POST_bullet_ideas(req: NextRequest) {
  try {
    const { competitorBullets } = await req.json()
    if (!Array.isArray(competitorBullets)) {
      return NextResponse.json({ error: "Missing competitorBullets" }, { status: 400 })
    }
    const prompt = `You are an expert Amazon listing copywriter. Given the bullet points from top competitors for a product, generate 10 creative, high-converting ideas for a single bullet point for our product. Each idea should be concise, persuasive, and highlight a unique benefit or feature, while leveraging the best elements from the competitor bullet points. Avoid direct copying—rephrase and improve upon what competitors are doing. Focus on clarity, customer appeal, and keyword inclusion. Make each 200-250 characters.\n\nCompetitor Bullet Points:\n${competitorBullets.map((b: string, i: number) => `${i + 1}. ${b}`).join("\n")}\n\nInstructions:\n- Each idea should be 1–2 sentences.\n- Use persuasive language and highlight unique selling points.\n- Incorporate relevant keywords where appropriate.\n- Do not repeat the same idea or phrasing.\n- Output as a JSON array of strings.\n\nExample Output:\n[\n  "Crafted from 100% organic matcha for a pure, vibrant flavor in every cup.",\n  "Stone-ground in Japan for a smooth, ceremonial-grade texture and taste.",\n  "Rich in antioxidants to support energy and focus throughout your day.",\n  "Perfect for lattes, smoothies, and baking—versatile for any recipe.",\n  "Resealable packaging keeps your matcha fresh and flavorful longer.",\n  "Sourced from first harvest leaves for maximum nutritional value.",\n  "Naturally gluten-free, vegan, and non-GMO for a clean, healthy choice.",\n  "Shade-grown and hand-picked for superior quality and color.",\n  "Tested for purity and safety, free from additives and preservatives.",\n  "Loved by baristas and home brewers alike for its exceptional taste."
]\nRespond ONLY with the JSON array, no extra commentary.`
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    })
    const content = completion.choices[0].message.content?.trim() || "[]"
    let result: string[] = []
    try {
      let cleanContent = content
        .replace(/^```json\s*/i, "")
        .replace(/^```/, "")
        .replace(/```$/, "")
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

/**
 * Description Suggestion API route.
 * Accepts POST requests with { competitorDescriptions: string[] }.
 * Calls OpenAI GPT-4o to generate 5 creative Amazon product descriptions based on competitor descriptions.
 * Returns a JSON array of strings.
 */
async function POST_description_ideas(req: NextRequest) {
  try {
    const { competitorDescriptions } = await req.json()
    if (!Array.isArray(competitorDescriptions)) {
      return NextResponse.json({ error: "Missing competitorDescriptions" }, { status: 400 })
    }
    const prompt = `You are an expert Amazon listing copywriter. Given the product descriptions from top competitors, generate 5 creative, high-converting Amazon product descriptions for our product. Each idea should be 3-6 sentences, persuasive, and unique. Avoid direct copying—rephrase and improve upon what competitors are doing. Focus on clarity, customer appeal, and keyword inclusion.\n\nCompetitor Descriptions:\n${competitorDescriptions.map((d: string, i: number) => `${i + 1}. ${d}`).join("\n\n")}\n\nInstructions:\n- Each idea should be 3-6 sentences.\n- Use persuasive language and highlight unique selling points.\n- Incorporate relevant keywords where appropriate.\n- Do not repeat the same idea or phrasing.\n- Output as a JSON array of strings.\n\nExample Output:\n[\n  "Experience the vibrant taste of our ceremonial grade matcha, stone-ground from the finest Japanese tea leaves. ...",\n  "Unlock clean energy and focus with our organic matcha, shade-grown and hand-picked for maximum flavor. ..."\n]\nRespond ONLY with the JSON array, no extra commentary.`
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    })
    const content = completion.choices[0].message.content?.trim() || "[]"
    let result: string[] = []
    try {
      let cleanContent = content
        .replace(/^```json\s*/i, "")
        .replace(/^```/, "")
        .replace(/```$/, "")
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

/**
 * Next.js API route handler for /api/gpt-suggest
 * Dispatches POST requests to either:
 *   - Title suggestion (default)
 *   - Keyword gap analysis (if x-ll-ai-action: 'keyword-gap' header is set)
 *   - Bullet point gap analysis (if x-ll-ai-action: 'bullet-gap' header is set)
 *   - Bullet point ideas (if x-ll-ai-action: 'bullet-ideas' header is set)
 *   - Description ideas (if x-ll-ai-action: 'description-ideas' header is set)
 */
const handler = async (req: NextRequest) => {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
  }
  const action = req.headers.get('x-ll-ai-action')
  if (action === 'keyword-gap') {
    // @ts-ignore
    return POST_keyword_gap(req)
  }
  if (action === 'bullet-gap') {
    // @ts-ignore
    return POST_bullet_gap(req)
  }
  if (action === 'bullet-ideas') {
    // @ts-ignore
    return POST_bullet_ideas(req)
  }
  if (action === 'description-ideas') {
    // @ts-ignore
    return POST_description_ideas(req)
  }
  // Default: title suggestion
  return POST(req)
}

export { handler as POST } 