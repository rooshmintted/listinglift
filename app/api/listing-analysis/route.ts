import { NextRequest, NextResponse } from 'next/server'

interface ListingContent {
  title: string
  bulletPoints: string[]
  description: string
}

interface AnalysisRequest {
  originalListing: ListingContent
  optimizedListing: ListingContent
  heroKeyword: string
}

/**
 * POST /api/listing-analysis
 * Analyzes the improvements between original and optimized listing content
 * Returns percentage improvements for CTR, conversion rate, keyword coverage, and total sales lift
 */
export async function POST(request: NextRequest) {
  try {
    const { originalListing, optimizedListing, heroKeyword }: AnalysisRequest = await request.json()

    if (!originalListing || !optimizedListing || !heroKeyword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY environment variable is not set')
      // Return fallback metrics if OpenAI is not configured
      return NextResponse.json({
        ctr_improvement: 12,
        conversion_improvement: 8,
        keyword_improvement: 45,
        total_sales_lift: 18,
        analysis_summary: "Fallback metrics - OpenAI API not configured"
      })
    }

    const prompt = `
You are an expert Amazon listing optimization analyst. Compare the original listing with the optimized listing and provide specific percentage improvements.

HERO KEYWORD: "${heroKeyword}"

ORIGINAL LISTING:
Title: "${originalListing.title}"
Bullet Points:
${originalListing.bulletPoints.map((bp, i) => `${i + 1}. ${bp}`).join('\n')}
Description: "${originalListing.description}"

OPTIMIZED LISTING:
Title: "${optimizedListing.title}"
Bullet Points:
${optimizedListing.bulletPoints.map((bp, i) => `${i + 1}. ${bp}`).join('\n')}
Description: "${optimizedListing.description}"

Analyze the improvements and provide ONLY positive percentages (0% minimum) for:

1. **Click-Through Rate (CTR) Improvement**: Based on title optimization, keyword placement, emotional triggers, and search relevance
2. **Conversion Rate Improvement**: Based on bullet point quality, benefit clarity, social proof, and persuasive elements
3. **Keyword Coverage Improvement**: Based on additional relevant keywords, long-tail variations, and search term density

Calculate a **Total Sales Lift %** by combining the improvements using this formula:
Total Sales Lift = (CTR Improvement * 0.6) + (Conversion Improvement * 0.4) + (Keyword Coverage Improvement * 0.1)

Respond ONLY with valid JSON in this exact format:
{
  "ctr_improvement": 12,
  "conversion_improvement": 8,
  "keyword_improvement": 45,
  "total_sales_lift": 8.5,
  "analysis_summary": "Brief 1-sentence explanation of the main improvements"
}

Be conservative and realistic. Typical Amazon listing optimizations see 3-15% sales lift. Base improvements on actual Amazon listing optimization principles and realistic market performance.
`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert Amazon listing optimization analyst. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    const analysisResult = data.choices[0]?.message?.content

    if (!analysisResult) {
      throw new Error('No analysis result from OpenAI')
    }

    // Parse the JSON response
    let metrics
    try {
      // Clean up any markdown code blocks if present
      const cleanResult = analysisResult.replace(/```json\s*|\s*```/g, '').trim()
      metrics = JSON.parse(cleanResult)
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', analysisResult)
      throw new Error('Invalid JSON response from analysis')
    }

    // Validate the metrics structure
    if (
      typeof metrics.ctr_improvement !== 'number' ||
      typeof metrics.conversion_improvement !== 'number' ||
      typeof metrics.keyword_improvement !== 'number' ||
      typeof metrics.total_sales_lift !== 'number'
    ) {
      throw new Error('Invalid metrics format')
    }

    // Ensure all values are non-negative
    metrics.ctr_improvement = Math.max(0, metrics.ctr_improvement)
    metrics.conversion_improvement = Math.max(0, metrics.conversion_improvement)
    metrics.keyword_improvement = Math.max(0, metrics.keyword_improvement)
    metrics.total_sales_lift = Math.max(0, metrics.total_sales_lift)

    return NextResponse.json(metrics)

  } catch (error: any) {
    console.error('Listing analysis error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to analyze listing improvements' },
      { status: 500 }
    )
  }
} 