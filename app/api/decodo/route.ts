/**
 * API route for Decodo scraping.
 * Accepts POST requests with { target, query, ... } in the body.
 * Calls the server-side scrapeDecodo and returns the result.
 *
 * This route is required because DECODO_KEY is a server-only environment variable.
 */

import { NextRequest, NextResponse } from "next/server"
import { scrapeDecodo } from "@/lib/decodo"

export async function POST(req: NextRequest) {
  try {
    const params = await req.json()
    const data = await scrapeDecodo(params)
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
} 