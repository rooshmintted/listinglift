"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Lightbulb,
  Zap,
  Target,
  TrendingUp,
  Sparkles,
  Rocket,
  FlameIcon as Fire,
  ArrowRight,
  Star,
  Users,
  DollarSign,
  BarChart3,
  CheckCircle,
  Mail,
  Lock,
  LogOut,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"
import { scrapeDecodo } from "../lib/decodo"
import OptimizeNav from "../components/ui/OptimizeNav"

interface ListingData {
  asin: string
  heroKeyword: string
  title: string
  bulletPoints: string[]
  description: string
}

interface AISuggestion {
  type: "title" | "bullet" | "description"
  suggestion: string
  reason: string
  impact: "high" | "medium" | "low"
}

type PageState = "landing" | "signup" | "login" | "app"

/**
 * Fetches the product title from Supabase by ASIN.
 * @param asin - The product ASIN
 * @returns The product title or an empty string
 */
async function fetchProductTitle(asin: string): Promise<string> {
  if (!asin) return ""
  const { data, error } = await supabase
    .from("products")
    .select("title")
    .eq("asin", asin)
    .limit(1)
    .single()
  if (error || !data?.title) return ""
  return data.title
}

export default function ListingLiftAI() {
  const [currentPage, setCurrentPage] = useState<PageState>("landing")
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const [listingData, setListingData] = useState<ListingData>({
    asin: "",
    heroKeyword: "",
    title: "",
    bulletPoints: ["", "", "", "", ""],
    description: "",
  })

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([])
  const [activeTab, setActiveTab] = useState("input")

  // Auth form state
  const [authData, setAuthData] = useState({
    email: "",
    password: "",
  })
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState("")

  const [error, setError] = useState("")

  // Check for existing session on mount
  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      if (session?.user) {
        setCurrentPage("app")
      }
      setLoading(false)
    }

    getSession()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        setCurrentPage("app")
      } else if (event === "SIGNED_OUT") {
        setCurrentPage("landing")
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const updateBulletPoint = (index: number, value: string) => {
    setListingData((prev) => ({
      ...prev,
      bulletPoints: prev.bulletPoints.map((point, i) => (i === index ? value : point)),
    }))
  }

  // Add new state for competitors after suggestions state
  const [competitors, setCompetitors] = useState<{
    asin: string
    title: string
    reviews_count: number
    rating: number
    position: number
  }[]>([])

  // Add at the top of the component, after useState declarations
  const [titles, setTitles] = useState<string[]>([""])

  /**
   * State for GPT-4o title suggestions (array) and loading/error.
   */
  const [gptSuggestions, setGptSuggestions] = useState<null | Array<{
    title: string
    ctr_increase: string
    cr_increase: string
    justification: string
    priority: string
    focus: string
  }>>(null)
  const [gptLoading, setGptLoading] = useState(false)
  const [gptError, setGptError] = useState("")

  // Add after gptSuggestions state:
  const [keywordGapResult, setKeywordGapResult] = useState<any>(null)
  const [keywordGapLoading, setKeywordGapLoading] = useState(false)
  const [keywordGapError, setKeywordGapError] = useState("")

  // Add state to track when to trigger analysis
  const [shouldAnalyzeKeywords, setShouldAnalyzeKeywords] = useState(false)
  const [lastAnalyzed, setLastAnalyzed] = useState(0)

  // Add local state for visible AI suggestions
  const [visibleGptSuggestions, setVisibleGptSuggestions] = useState<Array<any> | null>(null)

  // Add state to track the chosen title index and if a title has been chosen this session
  const [chosenTitleIdx, setChosenTitleIdx] = useState<number | null>(null)
  const [hasChosenTitleThisSession, setHasChosenTitleThisSession] = useState(false)

  // Add new state for bullet points loading and error
  const [bulletLoading, setBulletLoading] = useState(false)
  const [bulletError, setBulletError] = useState("")
  const [competitorDetails, setCompetitorDetails] = useState<any[]>([])

  // Add new state for bullet point keyword gap analysis
  const [bulletGapResult, setBulletGapResult] = useState<any>(null)
  const [bulletGapLoading, setBulletGapLoading] = useState(false)
  const [bulletGapError, setBulletGapError] = useState("")

  // Add new state for bullet point ideas
  const [bulletIdeas, setBulletIdeas] = useState<string[] | null>(null)
  const [bulletIdeasLoading, setBulletIdeasLoading] = useState(false)
  const [bulletIdeasError, setBulletIdeasError] = useState("")

  const [lastCopiedIdeaIdx, setLastCopiedIdeaIdx] = useState<number | null>(null)
  const [lastAcceptedIdeaIdx, setLastAcceptedIdeaIdx] = useState<number | null>(null)

  const [bulletPointMode, setBulletPointMode] = useState(false)

  const [chosenBulletIdxs, setChosenBulletIdxs] = useState<number[]>([])

  const [descriptionMode, setDescriptionMode] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState(listingData.description || "")
  const [descriptionIdeas, setDescriptionIdeas] = useState<string[] | null>(null)
  const [descriptionIdeasLoading, setDescriptionIdeasLoading] = useState(false)
  const [descriptionIdeasError, setDescriptionIdeasError] = useState("")
  const [descriptionDrafts, setDescriptionDrafts] = useState<string[]>(listingData.description ? [listingData.description] : [""])
  const [chosenDescriptionIdx, setChosenDescriptionIdx] = useState<number | null>(null)
  const [previewMode, setPreviewMode] = useState(false)

  const [copiedField, setCopiedField] = useState<string | null>(null)

  // When gptSuggestions changes, update visibleGptSuggestions
  useEffect(() => {
    setVisibleGptSuggestions(gptSuggestions)
  }, [gptSuggestions])

  // Handler for Accept
  function handleAcceptSuggestion(suggestionTitle: string) {
    setTitles(prev => [...prev, suggestionTitle])
  }
  // Handler for Reject
  function handleRejectSuggestion(idx: number) {
    setVisibleGptSuggestions(prev => prev ? prev.filter((_, i) => i !== idx) : prev)
  }

  /**
   * Adds a new empty product title field.
   */
  function addTitle() {
    setTitles((prev) => [...prev, ""])
  }

  /**
   * Removes a product title field by index.
   * @param idx - Index of the title to remove
   */
  function removeTitle(idx: number) {
    setTitles((prev) => prev.filter((_, i) => i !== idx))
  }

  /**
   * Updates a product title by index.
   * @param idx - Index of the title to update
   * @param value - New title value
   */
  function updateTitle(idx: number, value: string) {
    setTitles((prev) => prev.map((t, i) => (i === idx ? value : t)))
  }

  /**
   * Fetches the top 10 competitors for the current hero keyword from Supabase.
   * @param heroKeyword - The hero keyword to search for
   */
  const fetchCompetitors = useCallback(async (heroKeyword: string) => {
    if (!heroKeyword) return
    const { data, error } = await supabase
      .from("search_results")
      .select("asin, title, reviews_count, rating, position")
      .eq("hero_keyword", heroKeyword)
      .order("position", { ascending: true })
      .limit(10)
    if (error) throw error
    setCompetitors(data || [])
  }, [])

  /**
   * Generates AI suggestions by scraping product and search data from Decodo API.
   * Calls the /api/decodo API route (server-side) instead of scrapeDecodo directly.
   * Updates state with suggestions or error messages.
   */
  const generateSuggestions = async () => {
    setIsAnalyzing(true)
    setError("")
    try {
      // 1. Check if product exists in Supabase
      let productExists = false
      if (listingData.asin) {
        const { data: productRows, error: productError } = await supabase
          .from("products")
          .select("asin")
          .eq("asin", listingData.asin)
          .limit(1)
        if (productError) throw productError
        productExists = !!(productRows && productRows.length > 0)
      }

      // 2. Check if competitors exist in Supabase for hero keyword
      let competitorsExist = false
      if (listingData.heroKeyword) {
        const { data: competitorRows, error: competitorError } = await supabase
          .from("search_results")
          .select("asin")
          .eq("hero_keyword", listingData.heroKeyword)
          .limit(1)
        if (competitorError) throw competitorError
        competitorsExist = !!(competitorRows && competitorRows.length > 0)
      }

      // 3. Only call Decodo if data is missing
      if (!productExists && listingData.asin) {
        console.log("[AI] Starting Decodo product scrape", { asin: listingData.asin })
        const productRes = await fetch("/api/decodo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "amazon_product",
            query: listingData.asin,
            parse: true,
            autoselect_variant: false,
          }),
        })
        if (!productRes.ok) throw new Error("Product scrape failed: " + (await productRes.text()))
        const productData = await productRes.json()
        console.log("[AI] Decodo product scrape response", productData)
      } else {
        console.log("[AI] Product already exists in Supabase, skipping Decodo product call.")
      }

      if (!competitorsExist && listingData.heroKeyword) {
        console.log("[AI] Starting Decodo search scrape", { heroKeyword: listingData.heroKeyword })
        const searchRes = await fetch("/api/decodo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "amazon_search",
            query: listingData.heroKeyword,
            page_from: "1",
            parse: true,
          }),
        })
        if (!searchRes.ok) throw new Error("Search scrape failed: " + (await searchRes.text()))
        const searchData = await searchRes.json()
        console.log("[AI] Decodo search scrape response", searchData)
      } else {
        console.log("[AI] Competitors already exist in Supabase, skipping Decodo search call.")
      }

      // Always fetch competitors from Supabase for UI
      await fetchCompetitors(listingData.heroKeyword)
      // Fetch product title and set as first title in titles array
      const dbTitle = await fetchProductTitle(listingData.asin)
      if (dbTitle) setTitles((prev) => [dbTitle, ...prev.slice(1)])
      setActiveTab("optimize")
    } catch (error: any) {
      setError(error.message || "Failed to generate suggestions.")
    } finally {
      console.log("[AI] Finished generating suggestions")
      setIsAnalyzing(false)
    }
  }

  const applySuggestion = (suggestion: AISuggestion) => {
    console.log("Applying suggestion:", suggestion)
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError("")

    try {
      const { data, error } = await supabase.auth.signUp({
        email: authData.email,
        password: authData.password,
      })

      if (error) {
        setAuthError(error.message)
      } else if (data.user) {
        // Check if email confirmation is required
        if (!data.session) {
          setAuthError("Check your email for the confirmation link! 📧")
        }
      }
    } catch (error) {
      setAuthError("Something went wrong. Please try again! 😅")
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError("")

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authData.email,
        password: authData.password,
      })

      if (error) {
        setAuthError(error.message)
      }
    } catch (error) {
      setAuthError("Something went wrong. Please try again! 😅")
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  // Background component for reuse
  const BackgroundPattern = () => (
    <div className="absolute inset-0 opacity-10">
      <div className="absolute top-20 left-20 w-32 h-32 bg-yellow-300 rounded-full blur-xl"></div>
      <div className="absolute top-40 right-32 w-24 h-24 bg-cyan-300 rounded-full blur-lg"></div>
      <div className="absolute bottom-32 left-1/3 w-40 h-40 bg-green-300 rounded-full blur-2xl"></div>
      <div className="absolute bottom-20 right-20 w-28 h-28 bg-red-300 rounded-full blur-lg"></div>
    </div>
  )

  // Handler to load sample data into ASIN and hero keyword fields
  function handleLoadSampleData() {
    setListingData((prev: ListingData) => ({
      ...prev,
      asin: "B07DJ1KVDP",
      heroKeyword: "matcha powder"
    }))
  }

  /**
   * Calls the /api/gpt-suggest endpoint to get GPT-4o optimized title suggestions.
   * Uses the first title as the current title and competitor titles from the competitors state.
   */
  async function fetchGptSuggestion() {
    setGptLoading(true)
    setGptError("")
    setGptSuggestions(null)
    try {
      const currentTitle = titles[0] || listingData.title || ""
      const competitorTitles = competitors.map(c => c.title).filter(Boolean)
      const heroKeyword = listingData.heroKeyword || ""
      const res = await fetch("/api/gpt-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentTitle, competitorTitles, heroKeyword })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) throw new Error("No suggestions returned.")
      setGptSuggestions(data)
    } catch (err: any) {
      setGptError(err.message || "Failed to get suggestion.")
    } finally {
      setGptLoading(false)
    }
  }

  // Refactor useEffect: only run on tab change to 'optimize' or when shouldAnalyzeKeywords is set
  useEffect(() => {
    if (activeTab !== "optimize") return
    // Only fire on first load of optimize tab or when shouldAnalyzeKeywords is set
    if (!shouldAnalyzeKeywords && lastAnalyzed > 0) return
    const currentTitle = titles[0] || listingData.title || ""
    const competitorTitles = competitors.map(c => c.title).filter(Boolean)
    if (!currentTitle || competitorTitles.length === 0) return
    setKeywordGapLoading(true)
    setKeywordGapError("")
    setKeywordGapResult(null)
    fetch("/api/gpt-suggest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ll-ai-action": "keyword-gap"
      },
      body: JSON.stringify({ currentTitle, competitorTitles })
    })
      .then(async res => {
        if (!res.ok) throw new Error(await res.text())
        let text = await res.text()
        // Clean Markdown code block wrappers (```json ... ```)
        let clean = text
          .replace(/^```json\s*/i, "")
          .replace(/^```/, "")
          .replace(/```$/, "")
          .trim()
        try {
          return JSON.parse(clean)
        } catch {
          throw new Error("Malformed keyword gap response")
        }
      })
      .then(data => setKeywordGapResult(data))
      .catch(err => setKeywordGapError(err.message || "Failed to get keyword gap analysis."))
      .finally(() => {
        setKeywordGapLoading(false)
        setShouldAnalyzeKeywords(false)
        setLastAnalyzed(Date.now())
      })
  }, [activeTab, shouldAnalyzeKeywords])

  // On first load of optimize tab, trigger analysis
  useEffect(() => {
    if (activeTab === "optimize" && lastAnalyzed === 0) {
      setShouldAnalyzeKeywords(true)
    }
  }, [activeTab, lastAnalyzed])

  // Handler for choosing a title
  function handleChooseTitle(idx: number) {
    setChosenTitleIdx(idx)
    setHasChosenTitleThisSession(true)
  }

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-400 via-pink-500 to-purple-600 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white"></div>
      </div>
    )
  }

  if (currentPage === "landing") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-400 via-pink-500 to-purple-600 relative overflow-hidden">
        <BackgroundPattern />

        <div className="container mx-auto px-4 py-8 relative z-10">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="inline-block p-8 bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border-4 border-orange-500 transform hover:rotate-1 transition-transform duration-300 mb-8">
              <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 mb-6 tracking-tight">
                ListingLift<span className="text-orange-600">.ai</span>
              </h1>
              <div className="flex items-center justify-center gap-3 mb-6">
                <Sparkles className="w-8 h-8 text-orange-500" />
                <p className="text-3xl font-black text-gray-800">Turn Boring Listings Into Money Machines</p>
                <Fire className="w-8 h-8 text-red-500" />
              </div>
              <p className="text-xl text-gray-700 max-w-3xl mx-auto font-bold mb-8">
                AI-powered Amazon optimization that actually gets Gen Z shoppers to click "Add to Cart" 🛒✨
              </p>

              <div className="flex gap-4 justify-center">
                <Button
                  onClick={() => setCurrentPage("signup")}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black text-2xl px-16 py-8 rounded-3xl shadow-2xl transform hover:scale-105 transition-all duration-300 border-4 border-orange-400 hover:border-orange-300"
                >
                  <Rocket className="w-8 h-8 mr-4" />
                  Start Making Bank Now! 💰
                  <ArrowRight className="w-8 h-8 ml-4" />
                </Button>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => setCurrentPage("login")}
                  className="text-orange-600 hover:text-orange-700 font-bold underline text-lg"
                >
                  Already have an account? Sign in here! 👋
                </button>
              </div>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
            {[
              { icon: TrendingUp, stat: "347%", label: "Avg Conversion Boost", color: "from-green-500 to-emerald-500" },
              { icon: DollarSign, stat: "$2.3M+", label: "Revenue Generated", color: "from-yellow-500 to-orange-500" },
              { icon: Users, stat: "12K+", label: "Happy Sellers", color: "from-blue-500 to-cyan-500" },
              { icon: Star, stat: "4.9/5", label: "User Rating", color: "from-purple-500 to-pink-500" },
            ].map((item, index) => (
              <Card
                key={index}
                className="bg-white/95 backdrop-blur-sm border-4 border-orange-300 shadow-xl rounded-3xl overflow-hidden transform hover:scale-105 transition-all duration-300"
              >
                <CardContent className="p-6 text-center">
                  <div className={`inline-flex p-4 rounded-2xl bg-gradient-to-r ${item.color} mb-4`}>
                    <item.icon className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-3xl font-black text-gray-800 mb-2">{item.stat}</div>
                  <div className="text-sm font-bold text-gray-600">{item.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Features Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
            {[
              {
                icon: Target,
                title: "Competitor Spy Mode 🕵️",
                description:
                  "See exactly what your competition is doing and steal their best strategies (legally, obvs)",
                color: "from-cyan-500 to-blue-500",
                borderColor: "border-cyan-400",
              },
              {
                icon: Zap,
                title: "AI That Actually Gets It 🤖",
                description:
                  "Our AI speaks Gen Z and knows what makes people click 'buy now' instead of scrolling past",
                color: "from-orange-500 to-red-500",
                borderColor: "border-orange-400",
              },
              {
                icon: BarChart3,
                title: "Instant Results ⚡",
                description: "Watch your conversion rates go brrrr as soon as you implement our suggestions",
                color: "from-green-500 to-emerald-500",
                borderColor: "border-green-400",
              },
            ].map((feature, index) => (
              <Card
                key={index}
                className={`bg-white/95 backdrop-blur-sm border-4 ${feature.borderColor} shadow-2xl rounded-3xl overflow-hidden transform hover:scale-105 transition-all duration-300`}
              >
                <CardHeader className={`bg-gradient-to-r ${feature.color} text-white p-6`}>
                  <CardTitle className="flex items-center gap-3 text-xl font-black">
                    <feature.icon className="w-6 h-6" />
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-gray-700 font-medium text-lg">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Testimonials */}
          <Card className="bg-white/95 backdrop-blur-sm border-4 border-purple-400 shadow-2xl rounded-3xl overflow-hidden mb-16">
            <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-8">
              <CardTitle className="text-3xl font-black text-center">What Our Users Are Saying 💬</CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  {
                    name: "Sarah M.",
                    role: "Amazon Seller",
                    quote:
                      "My conversion rate went from 2% to 8% in just one week! This AI is absolutely unhinged (in the best way) 🔥",
                    rating: 5,
                  },
                  {
                    name: "Jake T.",
                    role: "E-commerce Brand",
                    quote:
                      "Finally, an AI that doesn't sound like it was written by a boomer. My sales are literally going to the moon! 🚀",
                    rating: 5,
                  },
                  {
                    name: "Maya L.",
                    role: "Product Manager",
                    quote:
                      "The competitor analysis feature is chef's kiss. I'm basically a listing optimization queen now 👑",
                    rating: 5,
                  },
                ].map((testimonial, index) => (
                  <div
                    key={index}
                    className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-2xl border-3 border-purple-200"
                  >
                    <div className="flex text-yellow-400 mb-3">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="w-5 h-5 fill-current" />
                      ))}
                    </div>
                    <p className="text-gray-700 font-medium mb-4 italic">"{testimonial.quote}"</p>
                    <div className="font-bold text-gray-800">
                      {testimonial.name}
                      <div className="text-sm font-medium text-gray-600">{testimonial.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* CTA Section */}
          <div className="text-center">
            <Card className="bg-white/95 backdrop-blur-sm border-4 border-orange-400 shadow-2xl rounded-3xl overflow-hidden inline-block">
              <CardContent className="p-12">
                <h2 className="text-4xl font-black text-gray-800 mb-4">Ready to Become an Amazon Legend? 👑</h2>
                <p className="text-xl text-gray-600 font-bold mb-8">
                  Join thousands of sellers who are already crushing it!
                </p>
                <Button
                  onClick={() => setCurrentPage("signup")}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black text-2xl px-12 py-6 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300 border-4 border-orange-400"
                  size="lg"
                  disabled={!listingData.asin || !listingData.heroKeyword || isAnalyzing}
                >
                  {isAnalyzing ? (
                    <>
                      <div className="animate-spin rounded-full h-6 w-6 border-b-3 border-white mr-3"></div>
                      AI is cooking... 🔥
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-6 h-6 mr-3" />
                      Generate AI Magic ✨
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (currentPage === "signup") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-400 via-pink-500 to-purple-600 relative overflow-hidden">
        <BackgroundPattern />

        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="max-w-md mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-block p-6 bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border-4 border-orange-500 mb-6">
                <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 mb-2">
                  ListingLift<span className="text-orange-600">.ai</span>
                </h1>
                <p className="text-lg font-bold text-gray-700">Join the Revolution! ✨</p>
              </div>
            </div>

            {/* Signup Form */}
            <Card className="bg-white/95 backdrop-blur-sm border-4 border-orange-400 shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-8">
                <CardTitle className="text-2xl font-black text-center flex items-center justify-center gap-2">
                  <Sparkles className="w-6 h-6" />
                  Create Your Account
                  <Fire className="w-6 h-6" />
                </CardTitle>
                <CardDescription className="text-orange-100 text-center font-medium">
                  Ready to make your listings absolutely iconic? 💅
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <form onSubmit={handleSignup} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="email" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Mail className="w-5 h-5 text-orange-500" />
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={authData.email}
                      onChange={(e) => setAuthData((prev) => ({ ...prev, email: e.target.value }))}
                      className="text-lg p-4 border-3 border-orange-300 rounded-2xl focus:border-orange-500 focus:ring-4 focus:ring-orange-200 font-medium"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="password" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-orange-500" />
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Make it strong! 💪"
                      value={authData.password}
                      onChange={(e) => setAuthData((prev) => ({ ...prev, password: e.target.value }))}
                      className="text-lg p-4 border-3 border-orange-300 rounded-2xl focus:border-orange-500 focus:ring-4 focus:ring-orange-200 font-medium"
                      required
                    />
                  </div>

                  {authError && (
                    <div className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
                      <p className="text-red-600 font-medium text-center">{authError}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black text-xl px-8 py-6 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300 border-4 border-orange-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {authLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                        Creating Account...
                      </>
                    ) : (
                      <>
                        <Rocket className="w-6 h-6 mr-3" />
                        Start My Glow-Up Journey! ✨
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-6 text-center space-y-2">
                  <button
                    onClick={() => setCurrentPage("login")}
                    className="text-orange-600 hover:text-orange-700 font-bold underline"
                  >
                    Already have an account? Sign in! 👋
                  </button>
                  <br />
                  <button
                    onClick={() => setCurrentPage("landing")}
                    className="text-gray-600 hover:text-gray-700 font-medium underline"
                  >
                    ← Back to Landing Page
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Benefits Reminder */}
            <Card className="mt-8 bg-white/90 backdrop-blur-sm border-3 border-green-400 shadow-xl rounded-2xl">
              <CardContent className="p-6">
                <h3 className="font-black text-lg text-gray-800 mb-4 text-center">What You Get: 🎁</h3>
                <div className="space-y-2">
                  {[
                    "AI-powered listing optimization",
                    "Competitor analysis & insights",
                    "Real-time conversion suggestions",
                    "24/7 support from our team",
                  ].map((benefit, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="font-medium text-gray-700">{benefit}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (currentPage === "login") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-400 via-pink-500 to-purple-600 relative overflow-hidden">
        <BackgroundPattern />

        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="max-w-md mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-block p-6 bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border-4 border-orange-500 mb-6">
                <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 mb-2">
                  ListingLift<span className="text-orange-600">.ai</span>
                </h1>
                <p className="text-lg font-bold text-gray-700">Welcome Back! 👋</p>
              </div>
            </div>

            {/* Login Form */}
            <Card className="bg-white/95 backdrop-blur-sm border-4 border-orange-400 shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-8">
                <CardTitle className="text-2xl font-black text-center flex items-center justify-center gap-2">
                  <Fire className="w-6 h-6" />
                  Sign In
                  <Sparkles className="w-6 h-6" />
                </CardTitle>
                <CardDescription className="text-orange-100 text-center font-medium">
                  Ready to optimize some listings? Let's go! 🚀
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <form onSubmit={handleLogin} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="email" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Mail className="w-5 h-5 text-orange-500" />
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={authData.email}
                      onChange={(e) => setAuthData((prev) => ({ ...prev, email: e.target.value }))}
                      className="text-lg p-4 border-3 border-orange-300 rounded-2xl focus:border-orange-500 focus:ring-4 focus:ring-orange-200 font-medium"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="password" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-orange-500" />
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Your password"
                      value={authData.password}
                      onChange={(e) => setAuthData((prev) => ({ ...prev, password: e.target.value }))}
                      className="text-lg p-4 border-3 border-orange-300 rounded-2xl focus:border-orange-500 focus:ring-4 focus:ring-orange-200 font-medium"
                      required
                    />
                  </div>

                  {authError && (
                    <div className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
                      <p className="text-red-600 font-medium text-center">{authError}</p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black text-xl px-8 py-6 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300 border-4 border-orange-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {authLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                        Signing In...
                      </>
                    ) : (
                      <>
                        <Rocket className="w-6 h-6 mr-3" />
                        Let's Optimize! 🔥
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-6 text-center space-y-2">
                  <button
                    onClick={() => setCurrentPage("signup")}
                    className="text-orange-600 hover:text-orange-700 font-bold underline"
                  >
                    Don't have an account? Sign up! ✨
                  </button>
                  <br />
                  <button
                    onClick={() => setCurrentPage("landing")}
                    className="text-gray-600 hover:text-gray-700 font-medium underline"
                  >
                    ← Back to Landing Page
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  // Main App (existing optimizer) - now with auth
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-400 via-pink-500 to-purple-600 relative overflow-hidden">
      <BackgroundPattern />

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Expanded Header Card */}
        <div className="w-full mb-8">
          <div className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-3xl shadow-2xl border-4 border-orange-500 p-8 flex flex-col xl:flex-row gap-8 items-stretch relative">
            {/* Left Column: Branding & Quick Actions (1/3) */}
            <div className="flex flex-col justify-between xl:w-1/3 w-full">
              <div>
                <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-100 to-yellow-200 mb-2 tracking-tight">
                  ListingLift<span className="text-orange-200">.ai</span>
                </h1>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-orange-100" />
                  <span className="text-xl font-bold text-white drop-shadow">Amazon Listing Optimizer</span>
                  <Fire className="w-5 h-5 text-red-200" />
                </div>
                <p className="text-md text-orange-50 max-w-2xl font-medium mb-2">
                  Turn your boring listings into conversion machines with AI that actually gets it 🚀
                </p>
                {user && (
                  <p className="text-xs text-orange-100 mt-2">Welcome back, {user.email}! 👋</p>
                )}
              </div>
              <div className="mt-6 border-t border-orange-200 pt-4">
                <h2 className="text-lg font-black text-orange-100 mb-2">Quick Actions ⚡</h2>
                <div className="flex flex-wrap gap-3 mb-4">
                  {activeTab === "input" && (
                    <>
                      <Button
                        className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold rounded-xl border-2 border-blue-400 text-sm"
                        onClick={handleLoadSampleData}
                      >
                        <Target className="w-4 h-4 mr-2" />
                        Load Sample Data
                      </Button>
                      <Button className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold rounded-xl border-2 border-green-400 text-sm">
                        <Rocket className="w-4 h-4 mr-2" />
                        Quick Start Guide
                      </Button>
                    </>
                  )}
                  {activeTab === "optimize" && (
                    <>
                      <Button className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold rounded-xl border-2 border-yellow-400 text-sm">
                        <Sparkles className="w-4 h-4 mr-2" />
                        Apply All Suggestions
                      </Button>
                      <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold rounded-xl border-2 border-purple-400 text-sm">
                        <Star className="w-4 h-4 mr-2" />
                        Save Progress
                      </Button>
                    </>
                  )}
                  {activeTab === "preview" && (
                    <>
                      <Button className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold rounded-xl border-2 border-green-400 text-sm">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Export Listing
                      </Button>
                      <Button className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold rounded-xl border-2 border-blue-400 text-sm">
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Performance Score
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold rounded-xl border-2 border-gray-500 text-sm">
                    💾 Save Optimization
                  </Button>
                  <Button className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold rounded-xl border-2 border-gray-500 text-sm">
                    📂 Load Previous
                  </Button>
                </div>
              </div>
            </div>
            {/* Right Column: Keywords Section (2/3) */}
            <div className="flex flex-col justify-between bg-white rounded-2xl p-6 border-2 border-orange-200 xl:w-2/3 w-full mt-8 xl:mt-0">
              <h2 className="text-xl font-black text-orange-500 mb-4 flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-orange-400" />
                Keywords
              </h2>
              <div className="absolute top-6 right-6">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-400 text-blue-700 font-bold px-4 py-2 rounded-xl shadow"
                  onClick={() => setShouldAnalyzeKeywords(true)}
                  disabled={keywordGapLoading}
                  aria-label="Re-analyze Keywords"
                >
                  {keywordGapLoading ? (
                    <span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></span>Analyzing...</span>
                  ) : (
                    <>Re-analyze</>
                  )}
                </Button>
              </div>
              <div className="flex-1">
                {keywordGapLoading && <div className="text-blue-600 font-bold">Analyzing keyword gaps...</div>}
                {keywordGapError && <div className="text-red-600 font-bold">{keywordGapError}</div>}
                {keywordGapResult && (
                  <div className="space-y-4">
                    {/* High Value Gaps */}
                    <div>
                      <div className="font-black text-md text-blue-700 mb-1 flex items-center gap-2">
                        <Badge className="bg-blue-600 text-white text-xs font-black border-2 border-blue-900">High Value Gaps</Badge>
                        <span className="text-xs text-blue-900">(Add these to your title!)</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(keywordGapResult.high_value_gaps || []).length > 0 ? (
                          keywordGapResult.high_value_gaps.map((kw: string) => (
                            <Badge key={kw} className="bg-blue-100 text-blue-800 border-blue-300 font-bold text-xs">{kw}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500">No high value gaps found.</span>
                        )}
                      </div>
                    </div>
                    {/* Missing Keywords */}
                    <div>
                      <div className="font-black text-md text-blue-700 mb-1 flex items-center gap-2">
                        <Badge className="bg-cyan-600 text-white text-xs font-black border-2 border-cyan-900">Missing Keywords</Badge>
                        <span className="text-xs text-cyan-900">(From competitors, not in your title)</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(keywordGapResult.missing_keywords || []).length > 0 ? (
                          keywordGapResult.missing_keywords.map((kw: any, i: number) => (
                            <Badge key={kw.keyword + i} className="bg-cyan-100 text-cyan-800 border-cyan-300 font-bold text-xs">{kw.keyword}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500">No missing keywords found.</span>
                        )}
                      </div>
                    </div>
                    {/* Our Existing Keywords */}
                    <div>
                      <div className="font-black text-md text-blue-700 mb-1 flex items-center gap-2">
                        <Badge className="bg-green-600 text-white text-xs font-black border-2 border-green-900">Your Title Keywords</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(keywordGapResult.our_existing_keywords || []).length > 0 ? (
                          keywordGapResult.our_existing_keywords.map((kw: string) => (
                            <Badge key={kw} className="bg-green-100 text-green-800 border-green-300 font-bold text-xs">{kw}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500">No keywords found in your title.</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Logout button, absolutely positioned */}
            <Button
              onClick={handleLogout}
              className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white p-2 rounded-xl"
              size="sm"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8 bg-white/90 backdrop-blur-sm p-2 rounded-2xl shadow-xl border-4 border-orange-400">
            <TabsTrigger
              value="input"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-red-500 data-[state=active]:text-white font-bold rounded-xl transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:scale-105"
            >
              <Target className="w-5 h-5" />
              Input Data
            </TabsTrigger>
            <TabsTrigger
              value="optimize"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-red-500 data-[state=active]:text-white font-bold rounded-xl transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:scale-105"
            >
              <Zap className="w-5 h-5" />
              Optimize
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-red-500 data-[state=active]:text-white font-bold rounded-xl transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:scale-105"
            >
              <TrendingUp className="w-5 h-5" />
              Preview
            </TabsTrigger>
          </TabsList>
          {/* Show OptimizeNav only when Optimize tab is active */}
          {activeTab === "optimize" && (
            <OptimizeNav selected={descriptionMode ? "Description" : bulletPointMode ? "Bullet Points" : "Title"} />
          )}

          <TabsContent value="input" className="space-y-6">
            <Card className="bg-white/95 backdrop-blur-sm border-4 border-orange-400 shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-8">
                <CardTitle className="text-3xl font-black flex items-center gap-3">
                  <Rocket className="w-8 h-8" />
                  Let's Get This Bread! 🍞
                </CardTitle>
                <CardDescription className="text-orange-100 text-lg font-medium">
                  Just drop your ASIN and hero keyword - we'll handle the rest like the legends we are ✨
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
                  <div className="space-y-3">
                    <Label htmlFor="asin" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Target className="w-5 h-5 text-orange-500" />
                      Your Product ASIN
                    </Label>
                    <Input
                      id="asin"
                      placeholder="B08N5WRWNW"
                      value={listingData.asin}
                      onChange={(e) => setListingData((prev) => ({ ...prev, asin: e.target.value }))}
                      className="text-lg p-4 border-3 border-orange-300 rounded-2xl focus:border-orange-500 focus:ring-4 focus:ring-orange-200 font-medium"
                    />
                    <p className="text-sm text-gray-600 font-medium">
                      That 10-character Amazon code that identifies your product 🎯
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="heroKeyword" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Fire className="w-5 h-5 text-red-500" />
                      Hero Keyword
                    </Label>
                    <Input
                      id="heroKeyword"
                      placeholder="wireless bluetooth headphones"
                      value={listingData.heroKeyword}
                      onChange={(e) => setListingData((prev) => ({ ...prev, heroKeyword: e.target.value }))}
                      className="text-lg p-4 border-3 border-orange-300 rounded-2xl focus:border-orange-500 focus:ring-4 focus:ring-orange-200 font-medium"
                    />
                    <p className="text-sm text-gray-600 font-medium">The main keyword that's gonna make you rich 💰</p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-center justify-center gap-4 pt-4">
                  <Button
                    className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold rounded-xl border-2 border-blue-400 text-md md:text-lg px-6 py-4 md:px-8 md:py-6"
                    onClick={handleLoadSampleData}
                    type="button"
                  >
                    <Target className="w-5 h-5 mr-2" />
                    Load Sample Data
                  </Button>
                  <Button
                    onClick={() => {
                      console.log("[UI] Generate AI Magic button clicked", { asin: listingData.asin, heroKeyword: listingData.heroKeyword })
                      generateSuggestions()
                    }}
                    className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black text-xl px-12 py-6 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300 border-4 border-orange-400 hover:border-orange-300"
                    size="lg"
                    disabled={!listingData.asin || !listingData.heroKeyword || isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="animate-spin rounded-full h-6 w-6 border-b-3 border-white mr-3"></div>
                        AI is cooking... 🔥
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-6 h-6 mr-3" />
                        Generate AI Magic ✨
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="optimize" className="space-y-6">
            {descriptionMode ? (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Column 1: Your Description(s) */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-green-400 shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-6">
                    <CardTitle className="text-xl font-black">Your Description</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    {descriptionDrafts.map((desc, idx) => (
                      <div key={idx} className={`flex flex-col gap-1 mb-4 border-2 rounded-xl ${chosenDescriptionIdx === idx ? 'border-green-500 bg-green-50' : 'border-green-300 bg-white'}`}>
                        <Textarea
                          rows={10}
                          value={desc}
                          onChange={e => setDescriptionDrafts(prev => prev.map((d, i) => i === idx ? e.target.value : d))}
                          className="rounded-xl flex-1 bg-transparent"
                          placeholder={`Description ${idx + 1}`}
                        />
                        <div className="flex gap-2 mt-1 justify-end">
                          <Button
                            type="button"
                            size="sm"
                            className={`font-bold border-2 rounded-xl ${chosenDescriptionIdx === idx ? 'bg-green-500 text-white border-green-700' : 'bg-green-100 text-green-700 border-green-400'}`}
                            onClick={() => setChosenDescriptionIdx(idx)}
                          >
                            ^ Choose Description
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="font-bold border-2 border-red-400 text-red-700 rounded-xl bg-white hover:bg-red-50"
                            onClick={() => {
                              setDescriptionDrafts(prev => prev.filter((_, i) => i !== idx))
                              if (chosenDescriptionIdx === idx) setChosenDescriptionIdx(null)
                              else if (chosenDescriptionIdx && chosenDescriptionIdx > idx) setChosenDescriptionIdx(chosenDescriptionIdx - 1)
                            }}
                            aria-label="Delete description"
                          >
                            ^ Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-green-400 text-green-700"
                      onClick={() => setDescriptionDrafts(prev => [...prev, ""])}
                    >
                      +
                    </Button>
                    <Button
                      type="button"
                      className="bg-green-500 text-white font-bold rounded-xl mt-4 w-full"
                      onClick={() => { setPreviewMode(true); setActiveTab('preview'); }}
                    >
                      Next Step: Preview
                    </Button>
                  </CardContent>
                </Card>
                {/* Column 2: AI Description Suggestions */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-yellow-400 shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-6">
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Lightbulb className="w-6 h-6" />
                      AI Description Suggestions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <Button
                      type="button"
                      className="font-bold border-2 rounded-xl bg-purple-100 text-purple-700 border-purple-400 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                      onClick={async () => {
                        setDescriptionIdeasLoading(true)
                        setDescriptionIdeasError("")
                        setDescriptionIdeas(null)
                        try {
                          // Gather all competitor descriptions
                          const competitorDescs = competitorDetails.map((c: any) => c.description || "").filter(Boolean)
                          const res = await fetch("/api/gpt-suggest", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              "x-ll-ai-action": "description-ideas"
                            },
                            body: JSON.stringify({ competitorDescriptions: competitorDescs })
                          })
                          if (!res.ok) throw new Error(await res.text())
                          const data = await res.json()
                          setDescriptionIdeas(data)
                        } catch (err: any) {
                          setDescriptionIdeasError(err.message || "Failed to generate description ideas.")
                        } finally {
                          setDescriptionIdeasLoading(false)
                        }
                      }}
                      disabled={descriptionIdeasLoading || competitorDetails.length === 0}
                    >
                      {descriptionIdeasLoading ? "Generating..." : "Generate AI Description Suggestions"}
                    </Button>
                    {descriptionIdeasError && <div className="text-xs text-red-600 font-bold mt-2">{descriptionIdeasError}</div>}
                    {descriptionIdeas && (
                      <div className="space-y-4">
                        {descriptionIdeas.map((idea, idx) => (
                          <div key={idx} className="border-3 border-blue-400 rounded-2xl p-4 space-y-2 bg-gradient-to-br from-blue-50 to-blue-200 shadow-lg flex flex-col">
                            <div className="font-bold text-md text-gray-900 mb-2">{idea}</div>
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                className="bg-green-500 hover:bg-green-600 text-white font-bold border-2 border-green-700 rounded-xl shadow"
                                onClick={() => {
                                  setDescriptionDrafts(prev => [...prev, idea])
                                  setChosenDescriptionIdx(descriptionDrafts.length)
                                }}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-400 text-red-700 font-bold rounded-xl shadow"
                                onClick={() => setDescriptionIdeas(prev => prev ? prev.filter((_, i) => i !== idx) : prev)}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                {/* Column 3: Competitor Descriptions */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-cyan-400 shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white p-6">
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Target className="w-6 h-6" />
                      Competitor Descriptions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {competitorDetails.map((comp, idx) => (
                      <div key={comp.asin || idx} className="mb-4 border-2 border-cyan-200 rounded-xl p-3">
                        <div className="font-bold text-cyan-800 mb-1">{comp.title || <span className="italic text-gray-400">No title</span>}</div>
                        <div className="mb-1">
                          <span className="font-bold text-cyan-600 text-xs">Description:</span>
                          <div className="text-xs text-gray-700 bg-cyan-50 rounded px-2 py-1 border border-cyan-100 mt-1 whitespace-pre-wrap">
                            {comp.description ? comp.description : <span className="text-gray-400 italic">No description found.</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : bulletPointMode ? (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Column 1: Current Bullet Points */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-green-400 shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-6 flex flex-row items-center justify-between">
                    <CardTitle className="text-xl font-black">Your Bullet Points (Choose 5)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="space-y-3">
                      {listingData.bulletPoints.map((bp, idx) => {
                        const isSelected = chosenBulletIdxs.includes(idx)
                        const canSelectMore = isSelected || chosenBulletIdxs.length < 5
                        return (
                          <div
                            key={idx}
                            className={`flex flex-col gap-1 mb-4 border-2 rounded-xl ${isSelected ? 'border-green-500 bg-green-50' : 'border-green-300 bg-white'}`}
                          >
                            <Textarea
                              rows={2}
                              value={bp}
                              onChange={e => setListingData(prev => {
                                const newBullets = [...prev.bulletPoints]
                                newBullets[idx] = e.target.value
                                return { ...prev, bulletPoints: newBullets }
                              })}
                              className="rounded-xl flex-1 bg-transparent"
                              placeholder={`Bullet Point ${idx + 1}`}
                            />
                            <div className="flex gap-2 mt-1 justify-end">
                              <Button
                                type="button"
                                size="sm"
                                className={`font-bold border-2 rounded-xl ${isSelected ? 'bg-green-500 text-white border-green-700' : 'bg-green-100 text-green-700 border-green-400'}`}
                                onClick={() => {
                                  setChosenBulletIdxs(prev => {
                                    if (isSelected) {
                                      return prev.filter(i => i !== idx)
                                    } else if (prev.length < 5) {
                                      return [...prev, idx]
                                    } else {
                                      return prev
                                    }
                                  })
                                }}
                                disabled={!canSelectMore}
                              >
                                ^ Choose Bullet
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="font-bold border-2 border-red-400 text-red-700 rounded-xl bg-white hover:bg-red-50"
                                onClick={() => setListingData(prev => {
                                  const newBullets = prev.bulletPoints.filter((_, i) => i !== idx)
                                  // Update chosenBulletIdxs: remove idx, decrement indices > idx
                                  setChosenBulletIdxs(chosen => chosen
                                    .filter(i => i !== idx)
                                    .map(i => (i > idx ? i - 1 : i))
                                  )
                                  return { ...prev, bulletPoints: newBullets }
                                })}
                                aria-label="Delete bullet point"
                              >
                                ^ Delete
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                      <Button type="button" size="sm" variant="outline" className="border-green-400 text-green-700" onClick={() => setListingData(prev => ({ ...prev, bulletPoints: [...prev.bulletPoints, ""] }))}>
                        + Add Bullet Point
                      </Button>
                      {!descriptionMode && (
                        <Button
                          type="button"
                          className="bg-green-500 text-white font-bold rounded-xl mt-4 w-full"
                          onClick={() => { setDescriptionMode(true); setBulletPointMode(false); }}
                        >
                          Next Step: Description
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
                {/* Column 2: AI Suggestions & Gap Analysis */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-yellow-400 shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-6">
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Lightbulb className="w-6 h-6" />
                      AI Bullet Point Suggestions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <Button
                      type="button"
                      className="font-bold border-2 rounded-xl bg-purple-100 text-purple-700 border-purple-400 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                      onClick={async () => {
                        setBulletIdeasLoading(true)
                        setBulletIdeasError("")
                        setBulletIdeas(null)
                        try {
                          // Gather all competitor bullet points (flattened)
                          const allCompetitorBullets = competitorDetails.flatMap((c: any) => (c.bullet_points || "").split("\n").filter(Boolean))
                          const res = await fetch("/api/gpt-suggest", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              "x-ll-ai-action": "bullet-ideas"
                            },
                            body: JSON.stringify({ competitorBullets: allCompetitorBullets })
                          })
                          if (!res.ok) throw new Error(await res.text())
                          const data = await res.json()
                          setBulletIdeas(data)
                        } catch (err: any) {
                          setBulletIdeasError(err.message || "Failed to generate bullet point ideas.")
                        } finally {
                          setBulletIdeasLoading(false)
                        }
                      }}
                      disabled={bulletIdeasLoading || competitorDetails.length === 0}
                    >
                      {bulletIdeasLoading ? "Generating..." : "Generate AI Bullet Point Suggestions"}
                    </Button>
                    {bulletIdeasError && <div className="text-xs text-red-600 font-bold mt-2">{bulletIdeasError}</div>}
                    {/* AI Bullet Point Ideas Cards */}
                    {bulletIdeas && (
                      <div className="space-y-4">
                        {bulletIdeas.map((idea, idx) => (
                          <div key={idx} className="border-3 border-blue-400 rounded-2xl p-4 space-y-2 bg-gradient-to-br from-blue-50 to-blue-200 shadow-lg flex flex-col">
                            <div className="font-bold text-md text-gray-900 mb-2">{idea}</div>
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                className="bg-green-500 hover:bg-green-600 text-white font-bold border-2 border-green-700 rounded-xl shadow"
                                onClick={() => {
                                  setListingData(prev => ({ ...prev, bulletPoints: [...prev.bulletPoints, idea] }))
                                  setBulletIdeas(prev => prev ? prev.filter((_, i) => i !== idx) : prev)
                                }}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-400 text-red-700 font-bold rounded-xl shadow"
                                onClick={() => setBulletIdeas(prev => prev ? prev.filter((_, i) => i !== idx) : prev)}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                {/* Column 3: Competitor Bullet Points */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-cyan-400 shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white p-6">
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Target className="w-6 h-6" />
                      Competitor Bullet Points
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {/* Show top 10 competitors' bullet points only (no description) */}
                    {competitorDetails.map((comp, idx) => (
                      <div key={comp.asin || idx} className="mb-4 border-2 border-cyan-200 rounded-xl p-3">
                        <div className="font-bold text-cyan-800 mb-1">{comp.title || <span className="italic text-gray-400">No title</span>}</div>
                        <div className="mb-1">
                          <span className="font-bold text-cyan-600 text-xs">Bullet Points:</span>
                          <ul className="ml-4 mt-1 space-y-1">
                            {(comp.bullet_points || "").split("\n").filter(Boolean).length > 0 ? (
                              (comp.bullet_points || "").split("\n").filter(Boolean).map((bp: string, i: number) => (
                                <li key={i} className="text-xs text-gray-700 bg-cyan-50 rounded px-2 py-1 border border-cyan-100">• {bp}</li>
                              ))
                            ) : (
                              <li className="text-xs text-gray-400 italic">No bullet points found.</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Editable Content - Left Column */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-green-400 shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-6">
                    <CardTitle className="text-xl font-black">Your Current Title</CardTitle>
                    <CardDescription className="text-green-100 font-medium">
                      Time to make your listing absolutely iconic 💅
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="space-y-3">
                      <Label className="text-sm font-black text-gray-800 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-green-500" />
                        Current Title
                      </Label>
                      <div className={`bg-green-50 border-2 rounded-xl p-4 font-bold text-gray-800 mb-4 ${chosenTitleIdx === null ? 'border-green-500 ring-2 ring-green-400' : 'border-green-200'}`}
                      >
                        {titles[0] || listingData.title || <span className="italic text-gray-400">No title yet</span>}
                      </div>
                      <Label className="text-sm font-black text-gray-800 flex items-center gap-2 mt-6">
                        <Sparkles className="w-4 h-4 text-green-500" />
                        New Title Options
                      </Label>
                      {titles.length <= 1 && (
                        <div className="italic text-gray-400 mb-2">No new title options yet. Add one or accept an AI suggestion!</div>
                      )}
                      {titles.slice(1).map((title, idx) => (
                        <div key={idx + 1} className={`mb-4 border-2 rounded-xl p-2 ${chosenTitleIdx === idx + 1 ? 'border-green-500 ring-2 ring-green-400' : 'border-transparent'}`}>
                          <Textarea
                            rows={5}
                            placeholder="Make it pop! Front-load your keyword and add some spice... 🌶️"
                            value={title}
                            onChange={e => updateTitle(idx + 1, e.target.value)}
                            className="border-3 border-green-300 rounded-2xl focus:border-green-500 focus:ring-4 focus:ring-green-200 font-medium w-full"
                          />
                          <div className="flex gap-2 mt-2 justify-end">
                            <Button
                              type="button"
                              size="sm"
                              className={`font-bold border-2 rounded-xl ${chosenTitleIdx === idx + 1 ? 'bg-green-500 text-white border-green-700' : 'border-green-400 text-green-700 bg-white hover:bg-green-50'}`}
                              onClick={() => handleChooseTitle(idx + 1)}
                            >
                              ^ Choose Title
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="font-bold border-2 border-red-400 text-red-700 rounded-xl bg-white hover:bg-red-50"
                              onClick={() => removeTitle(idx + 1)}
                              aria-label="Delete title"
                            >
                              ^ Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addTitle}
                          aria-label="Add another title"
                        >
                          + Add Another Title
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="font-bold border-2 rounded-xl bg-blue-100 text-blue-700 border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!hasChosenTitleThisSession || bulletLoading}
                          onClick={async () => {
                            setBulletLoading(true)
                            setBulletError("")
                            try {
                              const res = await fetch("/api/bullet-points", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ asin: listingData.asin, heroKeyword: listingData.heroKeyword })
                              })
                              if (!res.ok) throw new Error(await res.text())
                              const data = await res.json()
                              setListingData(prev => ({
                                ...prev,
                                bulletPoints: (data.product?.bullet_points || "").split("\n").filter(Boolean),
                                description: data.product?.description || ""
                              }))
                              setCompetitorDetails(data.competitors || [])
                              // After setting competitor details, trigger bullet gap analysis
                              const ourBullets = (data.product?.bullet_points || "").split("\n").filter(Boolean)
                              const competitorBullets = (data.competitors || []).map((c: any) => (c.bullet_points || "").split("\n").filter(Boolean))
                              setBulletGapLoading(true)
                              setBulletGapError("")
                              setBulletGapResult(null)
                              fetch("/api/gpt-suggest", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  "x-ll-ai-action": "bullet-gap"
                                },
                                body: JSON.stringify({ currentBullets: ourBullets, competitorBullets })
                              })
                                .then(async res => {
                                  if (!res.ok) throw new Error(await res.text())
                                  let text = await res.text()
                                  let clean = text
                                    .replace(/^```json\s*/i, "")
                                    .replace(/^```/, "")
                                    .replace(/```$/, "")
                                    .trim()
                                  try {
                                    return JSON.parse(clean)
                                  } catch {
                                    throw new Error("Malformed bullet gap response")
                                  }
                                })
                                .then(data => setBulletGapResult(data))
                                .catch(err => setBulletGapError(err.message || "Failed to get bullet gap analysis."))
                                .finally(() => setBulletGapLoading(false))
                              setBulletPointMode(true)
                              setDescriptionMode(false)
                            } catch (err: any) {
                              setBulletError(err.message || "Failed to fetch bullet points.")
                            } finally {
                              setBulletLoading(false)
                            }
                          }}
                        >
                          {bulletLoading ? "Loading..." : "Next Step: Optimize Bullet Points"}
                        </Button>
                      </div>
                      {bulletError && <div className="text-xs text-red-600 font-bold mt-2">{bulletError}</div>}
                    </div>
                  </CardContent>
                </Card>

                {/* AI Suggestions - Middle Column */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-yellow-400 shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-6">
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Lightbulb className="w-6 h-6" />
                      AI Suggestions 🤖
                    </CardTitle>
                    <CardDescription className="text-yellow-100 font-medium">
                      Your personal conversion coach is here! 🚀
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {/* Add GPT-4o Suggestion Button */}
                    <div className="mb-4">
                      <Button
                        onClick={fetchGptSuggestion}
                        disabled={gptLoading || !titles[0] || competitors.length === 0}
                        className="w-full text-xs font-bold bg-gradient-to-r from-black to-gray-800 hover:from-gray-900 hover:to-gray-700 border-2 border-gray-900 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 mb-2"
                      >
                        {gptLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                            Generating GPT-4o Suggestion...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Get GPT-4o Optimized Title
                          </>
                        )}
                      </Button>
                      {gptError && (
                        <div className="text-xs text-red-600 font-bold mt-2">{gptError}</div>
                      )}
                    </div>
                    {/* Show GPT-4o Suggestion Cards if available */}
                    {visibleGptSuggestions && (
                      <div className="grid grid-cols-1 gap-4">
                        {visibleGptSuggestions.map((sugg, idx) => (
                          <div
                            key={idx}
                            className="border-3 border-black rounded-2xl p-4 space-y-2 bg-gradient-to-br from-gray-50 to-gray-200 shadow-lg"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className="bg-black text-white text-xs font-black border-2 border-gray-900">GPT-4o</Badge>
                              <span className="text-xs font-bold text-gray-700">{sugg.focus} Focus</span>
                            </div>
                            <div className="font-black text-md text-gray-900 mb-1">{sugg.title}</div>
                            <div className="flex gap-2 text-xs font-bold">
                              <span className="bg-green-100 text-green-700 rounded px-2 py-1">CTR: {sugg.ctr_increase}</span>
                              <span className="bg-blue-100 text-blue-700 rounded px-2 py-1">CR: {sugg.cr_increase}</span>
                              <span className="bg-yellow-100 text-yellow-700 rounded px-2 py-1">Priority: {sugg.priority}</span>
                            </div>
                            <div className="text-xs text-gray-700 font-medium mt-1">{sugg.justification}</div>
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                className="bg-green-500 hover:bg-green-600 text-white font-bold border-2 border-green-700 rounded-xl shadow"
                                onClick={() => handleAcceptSuggestion(sugg.title)}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-400 text-red-700 font-bold rounded-xl shadow"
                                onClick={() => handleRejectSuggestion(idx)}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {suggestions.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-6xl mb-4">🤖</div>
                        <p className="text-gray-500 font-medium">Generate suggestions to unlock the AI magic!</p>
                      </div>
                    ) : (
                      suggestions.map((suggestion, index) => (
                        <div
                          key={index}
                          className="border-3 border-yellow-200 rounded-2xl p-4 space-y-3 bg-gradient-to-br from-yellow-50 to-orange-50 hover:shadow-lg transition-all duration-300"
                        >
                          <div className="flex items-center justify-between">
                            <Badge
                              variant={
                                suggestion.impact === "high"
                                  ? "destructive"
                                  : suggestion.impact === "medium"
                                    ? "default"
                                    : "secondary"
                              }
                              className={`text-xs font-black border-2 ${
                                suggestion.impact === "high"
                                  ? "bg-red-500 border-red-400"
                                  : suggestion.impact === "medium"
                                    ? "bg-orange-500 border-orange-400"
                                    : "bg-gray-500 border-gray-400"
                              }`}
                            >
                              {suggestion.impact === "high"
                                ? "🔥 HIGH"
                                : suggestion.impact === "medium"
                                  ? "⚡ MED"
                                  : "💡 LOW"}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-xs font-bold border-2 border-yellow-400 text-yellow-600"
                            >
                              {suggestion.type === "title"
                                ? "📝 TITLE"
                                : suggestion.type === "bullet"
                                  ? "🎯 BULLET"
                                  : "📄 DESC"}
                            </Badge>
                          </div>
                          <p className="font-bold text-sm text-gray-800">{suggestion.suggestion}</p>
                          <p className="text-xs text-gray-600 font-medium">{suggestion.reason}</p>
                          <Button
                            size="sm"
                            onClick={() => applySuggestion(suggestion)}
                            className="w-full text-xs font-bold bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 border-2 border-yellow-400 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                          >
                            Apply This Fire 🔥
                          </Button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Competitor Analysis - Right Column */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-cyan-400 shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white p-6">
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Target className="w-6 h-6" />
                      Competitor Intel 🕵️
                    </CardTitle>
                    <CardDescription className="text-cyan-100 font-medium">
                      Spying on the competition for "{listingData.heroKeyword}" 👀
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {!listingData.heroKeyword ? (
                      <div className="text-center py-12">
                        <div className="text-6xl mb-4">🤷‍♀️</div>
                        <p className="text-gray-500 font-medium">Enter your hero keyword to see who's winning!</p>
                      </div>
                    ) : competitors.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-6xl mb-4">🔎</div>
                        <p className="text-gray-500 font-medium">No competitors found for this keyword yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {competitors.map((comp, idx) => (
                          <div
                            key={comp.asin}
                            className="border-3 border-cyan-200 rounded-2xl p-4 flex flex-col gap-2 bg-gradient-to-br from-cyan-50 to-blue-50 hover:shadow-lg transition-all duration-300"
                          >
                            <div className="flex items-center justify-between">
                              <h4 className="font-black text-sm text-gray-800 break-words whitespace-normal w-full">{comp.title}</h4>
                              <Badge
                                variant="outline"
                                className="text-xs font-bold border-2 border-cyan-400 text-cyan-600"
                              >
                                🏆 Rank #{comp.position}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-700 font-medium">
                              <span>Reviews: <span className="font-black">{comp.reviews_count}</span></span>
                              <span>Rating: <span className="font-black">{comp.rating?.toFixed(1) ?? "-"}</span> ⭐</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="preview" className="space-y-6">
            <Card className="bg-white/95 backdrop-blur-sm border-4 border-purple-400 shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-8">
                <CardTitle className="text-3xl font-black flex items-center gap-3">
                  <TrendingUp className="w-8 h-8" />
                  Your Listing Preview 👀
                </CardTitle>
                <CardDescription className="text-purple-100 text-lg font-medium">
                  This is how your optimized listing will look to customers - it's giving main character energy! ✨
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                {/* Title Preview */}
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-2xl font-bold text-blue-600">{titles[chosenTitleIdx ?? 0] || listingData.title || "No title chosen"}</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-2 border-blue-400 text-blue-700 font-bold rounded-xl"
                    onClick={async () => {
                      await navigator.clipboard.writeText(titles[chosenTitleIdx ?? 0] || listingData.title || "")
                      setCopiedField('title')
                      setTimeout(() => setCopiedField(null), 1200)
                    }}
                  >
                    {copiedField === 'title' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                {/* Bullet Points Preview */}
                <div className="space-y-2">
                  <h3 className="font-black text-lg">About this item</h3>
                  <ul className="space-y-2">
                    {chosenBulletIdxs.length > 0
                      ? chosenBulletIdxs.map((idx, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm font-medium p-2 bg-gray-50 rounded-lg border-2 border-gray-200">
                            <span>• {listingData.bulletPoints[idx]}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="ml-2 border-green-400 text-green-700 font-bold rounded-xl"
                              onClick={async () => {
                                await navigator.clipboard.writeText(listingData.bulletPoints[idx] || "")
                                setCopiedField('bullet-' + idx)
                                setTimeout(() => setCopiedField(null), 1200)
                              }}
                            >
                              {copiedField === 'bullet-' + idx ? 'Copied!' : 'Copy'}
                            </Button>
                          </li>
                        ))
                      : <li className="text-sm text-gray-500 font-medium p-2 bg-gray-50 rounded-lg border-2 border-gray-200">No bullet points chosen.</li>}
                  </ul>
                </div>
                {/* Description Preview */}
                <div className="space-y-3">
                  <h3 className="font-black text-lg">Product Description</h3>
                  <div className="flex items-center gap-2">
                    <div className="text-sm whitespace-pre-wrap font-medium p-4 bg-gray-50 rounded-2xl border-2 border-gray-200 flex-1">
                      {chosenDescriptionIdx !== null && descriptionDrafts[chosenDescriptionIdx]
                        ? descriptionDrafts[chosenDescriptionIdx]
                        : "No description chosen."}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2 border-purple-400 text-purple-700 font-bold rounded-xl"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          (chosenDescriptionIdx !== null && descriptionDrafts[chosenDescriptionIdx]) || ""
                        )
                        setCopiedField('description')
                        setTimeout(() => setCopiedField(null), 1200)
                      }}
                    >
                      {copiedField === 'description' ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
