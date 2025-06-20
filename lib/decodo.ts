/**
 * Decodo Scraper API utility and Supabase integration.
 *
 * Encapsulates all Decodo API logic for Amazon product and search scraping.
 * After fetching data from Decodo, saves it to Supabase using the provided schema:
 *   - ASIN search: saves to 'products' table
 *   - Hero keyword search: saves each organic result to 'search_results' table
 *
 * Exposes a single function `scrapeDecodo` for use throughout the app.
 * Reads the DECODO_KEY from environment variables and throws errors on failure.
 * Returns parsed JSON responses from the Decodo API.
 *
 * Depends on the Supabase client in lib/supabase.ts
 */

import { supabase } from "./supabase"

/**
 * Saves a product to the 'products' table in Supabase.
 * @param product - Product object from Decodo ASIN search
 * @throws Error on Supabase insert failure
 */
async function saveProductToSupabase(product: any): Promise<any> {
  const { data, error } = await supabase.from("products").upsert({
    asin: product.asin,
    title: product.title,
    reviews_count: product.reviews_count,
    rating: product.rating,
    bullet_points: product.bullet_points,
    description: product.description,
    created_at: product.created_at || new Date().toISOString(),
  })
  if (error) throw error
  return data
}

/**
 * Saves all organic search results to the 'search_results' table in Supabase.
 * Filters out results with less than 50 reviews.
 * @param heroKeyword - The hero keyword used for the search
 * @param organicResults - Array of organic result objects from Decodo search
 * @throws Error on Supabase insert failure
 */
async function saveSearchResultsToSupabase(heroKeyword: string, organicResults: any[]): Promise<any> {
  if (!Array.isArray(organicResults)) throw new Error("organicResults must be an array")
  // Filter out results with less than 50 reviews
  const filteredResults = organicResults.filter(item => (item.reviews_count ?? 0) >= 50)
  const rows = filteredResults.map((item, idx) => ({
    hero_keyword: heroKeyword,
    asin: item.asin,
    title: item.title,
    reviews_count: item.reviews_count,
    rating: item.rating,
    bullet_points: item.bullet_points,
    description: item.description,
    position: item.pos || idx + 1,
    created_at: new Date().toISOString(),
  }))
  if (rows.length === 0) return []
  const { data, error } = await supabase.from("search_results").insert(rows)
  if (error) throw error
  return data
}

/**
 * Decodo Scraper API utility.
 * Handles product and search scraping for Amazon, and saves results to Supabase.
 * @param params - { target: "amazon_product" | "amazon_search", query: string, ... }
 * @returns Parsed JSON response from Decodo
 * @throws Error on failure
 */
export async function scrapeDecodo(params: Record<string, any>): Promise<any> {
  const key = process.env.DECODO_KEY
  if (!key) throw new Error("Missing DECODO_KEY env variable")
  console.log("[Decodo] Firing request", params)
  // Mask the key for logging
  const maskedKey = key.length > 8 ? key.slice(0, 4) + "..." + key.slice(-4) : key
  console.log("[Decodo] Using Authorization header: Basic " + maskedKey)
  console.log("[Decodo] Request payload:", JSON.stringify(params, null, 2))
  const response = await fetch("https://scraper-api.smartproxy.com/v2/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": key,
      //"Authorization": key,
    },
    body: JSON.stringify(params),
  })
  if (!response.ok) throw new Error(`Decodo API error: ${response.status}`)
  const data = await response.json()
  console.log("[Decodo] Received response", data)
  console.log("[Decodo] Received response", params.target)
  console.log("[Decodo] Received response", data.results[0].content.results.title)
  console.log("[Decodo] Parsed data structure:")
  console.log("[Decodo] - data exists:", !!data)
  console.log("[Decodo] - data keys:", Object.keys(data || {}))
  console.log("[Decodo] - data.results exists:", !!data?.results)


  // Save to Supabase according to schema
  if (params.target === "amazon_product" && data.results) {
    const result = data.results[0].content.results
    var product = {
      asin: result.asin,
      title: result.title,
      reviews_count: result.reviews_count,
      rating: result.rating,
      bullet_points: result.bullet_points,
      description: result.description,
      created_at: new Date().toISOString(),
    }
    await saveProductToSupabase(product)
    console.log("[Decodo] Product(s) saved to Supabase")
  }
  if (params.target === "amazon_search" && data.results[0].content.results.results.organic) {
    // Filter organic results with less than 50 reviews before saving
    const organicResults = data.results[0].content.results.results.organic
    // Map bullet_points and description if present
    const mappedOrganicResults = organicResults.map((item: any) => ({
      ...item,
      bullet_points: item.bullet_points,
      description: item.description,
    }))
    const filteredOrganicResults = mappedOrganicResults.filter((item: any) => (item.reviews_count ?? 0) >= 50)
    console.log("[Decodo] Saving filtered search results to Supabase", filteredOrganicResults)
    await saveSearchResultsToSupabase(
      data.results[0].content.results.query || params.query,
      filteredOrganicResults
    )
    console.log("[Decodo] Search results saved to Supabase")
  }

  return data
}

/**
 * Fires multiple Decodo API requests in parallel.
 * @param {Array<Record<string, any>>} paramsArray - Array of Decodo API parameter objects.
 * @returns {Promise<Array<any>>} - Array of Decodo API responses.
 * @throws Error if any request fails.
 */
export async function scrapeDecodoBatch(paramsArray: Record<string, any>[]): Promise<any[]> {
  if (!Array.isArray(paramsArray)) throw new Error("paramsArray must be an array")
  // Fire all requests in parallel
  return Promise.all(paramsArray.map(params => scrapeDecodo(params)))
} 