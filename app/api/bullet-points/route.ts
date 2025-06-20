/**
 * Bullet Points & Description API route.
 * Accepts POST requests with { asin, heroKeyword }.
 * Returns bullet_points and description for the product and competitors.
 * If missing, fetches from Decodo and updates Supabase.
 */
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { scrapeDecodo, scrapeDecodoBatch } from "@/lib/decodo"

export async function POST(req: NextRequest) {
  try {
    const { asin, heroKeyword } = await req.json()
    if (!asin || !heroKeyword) {
      return NextResponse.json({ error: "Missing asin or heroKeyword" }, { status: 400 })
    }

    // 1. Fetch product from Supabase
    let { data: product, error: productError } = await supabase
      .from("products")
      .select("asin, title, bullet_points, description")
      .eq("asin", asin)
      .single()
    if (productError && productError.code !== "PGRST116") throw productError

    // 2. Fetch competitors from Supabase (top 10 by position)
    let { data: competitorsRaw, error: competitorsError } = await supabase
      .from("search_results")
      .select("asin, title, position")
      .eq("hero_keyword", heroKeyword)
      .order("position", { ascending: true })
      .limit(10)
    if (competitorsError) throw competitorsError
    const competitorAsins = (competitorsRaw || []).map((c: any) => c.asin)

    // 2b. Batch fetch bullet_points/description for all competitor ASINs from products table
    let { data: competitorProducts, error: competitorProductsError } = await supabase
      .from("products")
      .select("asin, bullet_points, description")
      .in("asin", competitorAsins)
    if (competitorProductsError) throw competitorProductsError
    // Map asin to bullet_points/description
    const competitorProductMap = Object.fromEntries((competitorProducts || []).map((p: any) => [p.asin, p]))

    // 3. If product bullet_points or description missing, call Decodo
    if (!product || !product.bullet_points || !product.description) {
      await scrapeDecodo({ target: "amazon_product", query: asin, parse: true, autoselect_variant: false })
      // Re-fetch product
      const { data: newProduct } = await supabase
        .from("products")
        .select("asin, title, bullet_points, description")
        .eq("asin", asin)
        .single()
      product = newProduct
    }

    // 4. For any competitors missing bullet_points/description (null only), call Decodo for each
    const competitorsToFetch = competitorAsins.filter(asin => {
      const prod = competitorProductMap[asin]
      return !prod || prod.bullet_points === null || prod.description === null
    })
    if (competitorsToFetch.length > 0) {
      await scrapeDecodoBatch(
        competitorsToFetch.map(asin => ({ target: "amazon_product", query: asin, parse: true, autoselect_variant: false }))
      )
    }
    // Re-fetch competitor products after Decodo
    const { data: updatedCompetitorProducts } = await supabase
      .from("products")
      .select("asin, bullet_points, description")
      .in("asin", competitorAsins)
    // Rebuild map
    const updatedProductMap = Object.fromEntries((updatedCompetitorProducts || []).map((p: any) => [p.asin, p]))

    // Merge competitor data for response
    const competitors = (competitorsRaw || []).map((c: any) => ({
      asin: c.asin,
      title: c.title,
      position: c.position,
      bullet_points: updatedProductMap[c.asin]?.bullet_points ?? null,
      description: updatedProductMap[c.asin]?.description ?? null,
    }))

    return NextResponse.json({ product, competitors })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
} 