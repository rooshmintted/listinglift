"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SpellcheckTextarea } from "@/components/ui/spellcheck-textarea"
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
  ChevronLeft,
  ChevronRight,
  RotateCcw,
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

/**
 * ListingLiftAI main page component.
 * Handles authentication, product data input, AI optimization, and preview.
 * Implements a side-by-side Before vs After preview in the Preview tab.
 */
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

  // Add at the top of the component, after useState declarations
  const [optimizeStep, setOptimizeStep] = useState<"title" | "bullet" | "description">("title")
  const [completedSteps, setCompletedSteps] = useState<Array<"title" | "bullet" | "description">>([])

  const [originalListingData, setOriginalListingData] = useState<ListingData | null>(null)

  // Add new state for preview keyword gap analysis
  const [previewKeywordGap, setPreviewKeywordGap] = useState<any>(null)
  const [previewKeywordGapLoading, setPreviewKeywordGapLoading] = useState(false)
  const [previewKeywordGapError, setPreviewKeywordGapError] = useState("")

  // Add state for revenue calculator in preview
  const [currentRevenue, setCurrentRevenue] = useState<string>("")
  
  // Add state for performance metrics analysis
  const [performanceMetrics, setPerformanceMetrics] = useState<{
    ctr_improvement: number
    conversion_improvement: number
    keyword_improvement: number
    total_sales_lift: number
  } | null>(null)
  const [performanceLoading, setPerformanceLoading] = useState(false)

  // Prepopulate descriptionDrafts with original description when entering description step
  useEffect(() => {
    if (optimizeStep === "description" && originalListingData?.description) {
      setDescriptionDrafts(prev => {
        // Only add if not already present
        if (prev.length === 1 && prev[0] === "") {
          return [originalListingData.description]
        }
        // If original description is not in drafts, prepend it
        if (!prev.includes(originalListingData.description)) {
          return [originalListingData.description, ...prev]
        }
        return prev
      })
    }
  }, [optimizeStep, originalListingData])

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
    
    // Clear all optimization context and content for fresh start
    setTitles([""])
    setChosenTitleIdx(null)
    setHasChosenTitleThisSession(false)
    setGptSuggestions(null)
    setVisibleGptSuggestions(null)
    setGptError("")
    
    setListingData(prev => ({ ...prev, bulletPoints: ["", "", "", "", ""] }))
    setChosenBulletIdxs([])
    setBulletIdeas(null)
    setBulletError("")
    setBulletGapResult(null)
    setBulletGapError("")
    setCompetitorDetails([])
    
    setDescriptionDrafts([""])
    setChosenDescriptionIdx(null)
    setDescriptionIdeas(null)
    setDescriptionIdeasError("")
    
    setOptimizeStep("title")
    setCompletedSteps([])
    setOriginalListingData(null)
    setPerformanceMetrics(null)
    
    setKeywordGapResult(null)
    setKeywordGapError("")
    setLastAnalyzed(0)
    setShouldAnalyzeKeywords(false)
    
    setCompetitors([])
    setSuggestions([])
    
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
      if (dbTitle) {
        setTitles((prev) => [dbTitle, ...prev.slice(1)])
      }
      // Fetch full product data (title, bullet_points, description) and set originalListingData
      const { data: fullProduct } = await supabase
        .from("products")
        .select("asin, title, bullet_points, description")
        .eq("asin", listingData.asin)
        .single();
      if (fullProduct) {
        setOriginalListingData({
          asin: fullProduct.asin,
          heroKeyword: listingData.heroKeyword,
          title: fullProduct.title || "",
          bulletPoints: (fullProduct.bullet_points || "").split("\n").filter(Boolean),
          description: fullProduct.description || ""
        });
      }
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

  // Interactive Demo Component
  const InteractiveDemo = () => {
    const [demoStep, setDemoStep] = useState(1)
    const [isAnimating, setIsAnimating] = useState(false)
    const [demoLoading, setDemoLoading] = useState(false)

    const nextStep = () => {
      if (demoStep < 4) {
        setIsAnimating(true)
        setDemoLoading(true)
        setTimeout(() => {
          setDemoStep(demoStep + 1)
          setDemoLoading(false)
          setIsAnimating(false)
        }, 1500)
      }
    }

    const prevStep = () => {
      if (demoStep > 1) {
        setIsAnimating(true)
        setTimeout(() => {
          setDemoStep(demoStep - 1)
          setIsAnimating(false)
        }, 300)
      }
    }

    const resetDemo = () => {
      setDemoStep(1)
      setIsAnimating(false)
      setDemoLoading(false)
    }

    return (
      <div className="mb-16">
        <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#2C3E50] shadow-2xl rounded-3xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-[#2C3E50] to-[#2C3E50] text-white p-8">
            <CardTitle className="text-3xl font-black text-center flex items-center justify-center gap-3">
              <Sparkles className="w-8 h-8" />
              See ListingLift AI in Action ✨
              <Fire className="w-8 h-8" />
            </CardTitle>
            <CardDescription className="text-white text-xl font-medium text-center">
              Watch how we transform a basic matcha listing into a conversion machine!
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            {/* Progress Indicator */}
            <div className="flex justify-center mb-8">
              <div className="flex items-center gap-4">
                {[1, 2, 3, 4].map((step) => (
                  <div key={step} className="flex items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                        step <= demoStep
                          ? 'bg-[#2C3E50] text-white scale-110'
                          : 'bg-gray-300 text-gray-600'
                      }`}
                    >
                      {step}
                    </div>
                    {step < 4 && (
                      <div
                        className={`w-12 h-1 mx-2 transition-all duration-300 ${
                          step < demoStep ? 'bg-[#2C3E50]' : 'bg-gray-300'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Demo Content */}
            <div className={`transition-all duration-500 ${isAnimating ? 'opacity-50 transform scale-95' : 'opacity-100 transform scale-100'}`}>
              
              {/* Step 1: Smart Keyword Analysis */}
              {demoStep === 1 && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-black text-[#2C3E50] mb-2">🎯 Smart Keyword Analysis</h3>
                    <p className="text-lg text-gray-600 font-medium">Our AI discovers the keywords your competitors are using that you're missing</p>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* High Value Gaps */}
                    <div className="bg-gradient-to-br from-gray-50 to-gray-200 rounded-xl p-4 border-2 border-[#718096]">
                      <div className="font-black text-md mb-3 flex items-center gap-2">
                        <span className="text-black font-black">High Value Gaps</span>
                        <span className="text-xs text-gray-500">(Add these!)</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {["ceremonial", "premium", "first harvest"].map((kw) => (
                          <Badge key={kw} className="bg-[#718096] text-white border-[#718096] font-bold text-xs animate-pulse">{kw}</Badge>
                        ))}
                      </div>
                      <div className="mt-3 text-xs text-gray-600">
                        <strong>+15% CTR potential</strong> by adding these high-performing keywords
                      </div>
                    </div>

                    {/* Missing Keywords */}
                    <div className="bg-gradient-to-br from-gray-50 to-gray-200 rounded-xl p-4 border-2 border-[#718096]">
                      <div className="font-black text-md mb-3 flex items-center gap-2">
                        <span className="text-black font-black">Missing Keywords</span>
                        <span className="text-xs text-gray-500">(From competitors)</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {["Japanese", "Uji", "pure"].map((kw) => (
                          <Badge key={kw} className="bg-white text-[#2C3E50] border-[#718096] font-bold text-xs">{kw}</Badge>
                        ))}
                      </div>
                      <div className="mt-3 text-xs text-gray-600">
                        <strong>3x more keywords</strong> than your current title
                      </div>
                    </div>

                    {/* Your Keywords */}
                    <div className="bg-gradient-to-br from-gray-50 to-gray-200 rounded-xl p-4 border-2 border-[#718096]">
                      <div className="font-black text-md mb-3">
                        <span className="text-black font-black">Your Keywords</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {["organic", "matcha", "powder"].map((kw) => (
                          <Badge key={kw} className="bg-white text-[#2C3E50] border-[#718096] font-bold text-xs">{kw}</Badge>
                        ))}
                      </div>
                      <div className="mt-3 text-xs text-gray-600">
                        <strong>Current coverage:</strong> Basic keywords only
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: AI-Powered Title Generation */}
              {demoStep === 2 && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-black text-[#2C3E50] mb-2">🚀 AI-Powered Title Generation</h3>
                    <p className="text-lg text-gray-600 font-medium">Watch your boring title transform into a conversion machine</p>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Before */}
                    <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-6 border-2 border-red-200">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">×</span>
                        </div>
                        <span className="font-black text-lg text-red-700">Before (Boring)</span>
                      </div>
                      <div className="bg-white p-4 rounded-lg border-2 border-red-300 mb-4">
                        <p className="text-gray-800 font-medium">"Organic Matcha Powder - Green Tea"</p>
                      </div>
                      <div className="text-sm text-red-600 space-y-1">
                        <div>• Only 3 basic keywords</div>
                        <div>• Generic, boring positioning</div>
                        <div>• No competitive advantage</div>
                        <div>• Missing key Amazon search terms</div>
                        <div>• No emotional hooks or benefits</div>
                      </div>
                    </div>

                    {/* After */}
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border-2 border-green-200">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">✓</span>
                        </div>
                        <span className="font-black text-lg text-green-700">After (Optimized)</span>
                      </div>
                      <div className="bg-white p-4 rounded-lg border-2 border-green-300 mb-4">
                        <p className="text-gray-800 font-medium">"Premium Ceremonial Japanese Matcha Powder - First Harvest Uji Green Tea for Lattes, Smoothies & Baking - Stone Ground, Organic, Non-GMO - 4oz Resealable Pouch"</p>
                      </div>
                      <div className="text-sm text-green-600 space-y-1">
                        <div>• <strong>+15% CTR boost</strong></div>
                        <div>• <strong>+8% conversion rate</strong></div>
                        <div>• <strong>15+ high-value keywords</strong></div>
                        <div>• <strong>Amazon-compliant length</strong></div>
                        <div>• <strong>Includes size & key attributes</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Bullet Point Optimization */}
              {demoStep === 3 && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-black text-[#2C3E50] mb-2">⚡ Bullet Point Optimization</h3>
                    <p className="text-lg text-gray-600 font-medium">Transform weak bullet points into compelling sales drivers</p>
                  </div>
                  
                  <div className="space-y-6">
                    {/* Before/After Bullet Point */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-200 rounded-xl p-6 border-2 border-gray-300">
                        <h4 className="font-black text-md text-gray-700 mb-3">Before (Weak - 35 chars)</h4>
                        <div className="bg-white p-4 rounded-lg border-2 border-gray-300">
                          <p className="text-gray-600 text-sm">High quality matcha powder from Japan</p>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border-2 border-blue-300">
                        <h4 className="font-black text-md text-blue-700 mb-3">After (Compelling - 200 chars)</h4>
                        <div className="bg-white p-4 rounded-lg border-2 border-blue-300">
                          <p className="text-gray-800 text-sm font-medium">🍃 <strong>PREMIUM CEREMONIAL GRADE:</strong> Stone-ground first harvest matcha from Uji, Japan - the gold standard for authentic flavor and maximum health benefits. Perfect for traditional tea ceremonies or modern beverages</p>
                        </div>
                      </div>
                    </div>

                    {/* AI Suggestions Demo */}
                    <div className="bg-gradient-to-br from-gray-50 to-gray-200 rounded-xl p-6 border-2 border-[#718096]">
                      <h4 className="font-black text-lg text-[#2C3E50] mb-4 flex items-center gap-2">
                        <Lightbulb className="w-5 h-5" />
                        AI Suggestions (Demo)
                      </h4>
                      <div className="space-y-3">
                        {[
                          "🍃 PREMIUM CEREMONIAL GRADE: Stone-ground first harvest matcha from Uji, Japan - the gold standard for authentic flavor and maximum health benefits. Perfect for traditional tea ceremonies or modern beverages",
                          "🌟 PERFECT FOR LATTES & SMOOTHIES: Dissolves instantly with no bitter aftertaste - create café-quality drinks at home. Rich, creamy texture that blends beautifully with milk, oat milk, or your favorite non-dairy alternative",
                          "💚 ANTIOXIDANT POWERHOUSE: 10x more antioxidants than regular green tea - boost energy naturally without the crash. Packed with catechins, EGCG, and L-theanine for sustained focus and mental clarity throughout your day",
                          "🎯 VERSATILE KITCHEN ESSENTIAL: Perfect for baking matcha cookies, cakes, ice cream, face masks & traditional tea ceremonies. Add vibrant green color and authentic Japanese flavor to all your culinary creations",
                          "✅ PURE & NATURAL: No artificial flavors, colors, or preservatives. Certified organic, non-GMO, and gluten-free. Packaged in resealable pouch to maintain freshness and prevent oxidation for maximum potency"
                        ].map((suggestion, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-lg border-2 border-blue-300">
                            <span className="text-sm font-medium text-gray-800 flex-1">{suggestion}</span>
                            <div className="flex gap-2 ml-4">
                              <Button size="sm" className="bg-[#334155] text-white px-3 py-1 text-xs">Accept</Button>
                              <Button size="sm" variant="outline" className="border-red-400 text-red-600 px-3 py-1 text-xs">Reject</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Instant Results Preview */}
              {demoStep === 4 && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-black text-[#2C3E50] mb-2">📊 Instant Results Preview</h3>
                    <p className="text-lg text-gray-600 font-medium">See the dramatic transformation and projected performance boost</p>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Improved Listing Attributes */}
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border-2 border-green-300">
                      <h4 className="font-black text-xl text-green-700 mb-4 flex items-center gap-2">
                        <CheckCircle className="w-6 h-6" />
                        Improved Listing Attributes
                      </h4>
                      <div className="space-y-4">
                        {/* Optimized Title */}
                        <div className="bg-white p-4 rounded-lg border-2 border-green-300">
                          <div className="text-xs font-bold text-green-700 mb-2">✓ OPTIMIZED TITLE</div>
                          <div className="text-sm font-medium text-gray-800">
                            "Premium Ceremonial Japanese Matcha Powder - First Harvest Uji Green Tea for Lattes, Smoothies & Baking - Stone Ground, Organic, Non-GMO - 4oz Resealable Pouch"
                          </div>
                        </div>
                        {/* Key Bullet Points */}
                        <div className="bg-white p-4 rounded-lg border-2 border-green-300">
                          <div className="text-xs font-bold text-green-700 mb-2">✓ ENHANCED BULLET POINTS (5 OPTIMIZED)</div>
                          <div className="space-y-1 text-xs text-gray-700">
                            <div>• 🍃 Premium ceremonial grade from Uji, Japan - authentic flavor & maximum health benefits</div>
                            <div>• 🌟 Perfect for lattes & smoothies - dissolves instantly, no bitter aftertaste</div>
                            <div>• 💚 10x more antioxidants than regular green tea - natural energy without crash</div>
                            <div>• 🎯 Versatile kitchen essential - baking, ice cream, face masks & tea ceremonies</div>
                            <div>• ✅ Pure & natural - organic, non-GMO, gluten-free, resealable packaging</div>
                          </div>
                        </div>
                        {/* Enhanced Description */}
                        <div className="bg-white p-4 rounded-lg border-2 border-green-300">
                          <div className="text-xs font-bold text-green-700 mb-2">✓ COMPELLING DESCRIPTION (250+ WORDS)</div>
                          <div className="text-xs text-gray-700">
                            "Experience the authentic taste of Japan with our premium ceremonial grade matcha powder. Sourced directly from the ancient tea gardens of Uji, this stone-ground first harvest matcha delivers unparalleled flavor and health benefits. Whether you're creating traditional tea ceremonies or modern café-style beverages, our matcha transforms ordinary moments into extraordinary experiences. Rich in antioxidants, catechins, and L-theanine for sustained energy and mental clarity. Perfect for lattes, smoothies, baking, and wellness rituals..."
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Revenue Impact */}
                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-6 border-2 border-yellow-300">
                      <h4 className="font-black text-xl text-yellow-700 mb-4 flex items-center gap-2">
                        <DollarSign className="w-6 h-6" />
                        Revenue Impact Calculator
                      </h4>
                      <div className="space-y-4">
                        <div className="bg-white p-4 rounded-lg border-2 border-yellow-300">
                          <div className="text-center">
                            <div className="text-2xl font-black text-gray-800 mb-1">$2,847</div>
                            <div className="text-sm text-gray-600">Projected monthly revenue increase</div>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 space-y-2">
                          <div className="flex justify-between">
                            <span>Current monthly sales:</span>
                            <span className="font-medium">$8,500</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Optimized projection:</span>
                            <span className="font-medium text-green-600">$11,347</span>
                          </div>
                          <div className="border-t pt-2 flex justify-between font-bold">
                            <span>Monthly increase:</span>
                            <span className="text-green-600">+$2,847</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Call to Action */}
                  <div className="text-center bg-gradient-to-br from-[#F5B041]/20 to-[#E67E22]/20 rounded-xl p-8 border-2 border-[#F5B041]">
                    <h4 className="text-2xl font-black text-[#2C3E50] mb-4">Ready to Transform Your Listings? 🚀</h4>
                    <p className="text-lg text-gray-700 font-medium mb-6">
                      Join thousands of sellers who are already crushing it with ListingLift AI
                    </p>
                    <Button
                      onClick={() => setCurrentPage("signup")}
                      className="bg-gradient-to-r from-[#2C3E50] to-[#2C3E50] hover:from-[#1A252F] hover:to-[#1A252F] text-white font-black text-xl px-8 py-4 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300"
                    >
                      <Sparkles className="w-6 h-6 mr-3" />
                      Start Your Free Trial ✨
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
              <Button
                onClick={prevStep}
                disabled={demoStep === 1}
                variant="outline"
                className="border-[#718096] text-[#718096] hover:bg-[#718096] hover:text-white disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>

              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 font-medium">
                  Step {demoStep} of 4
                </span>
                {demoStep < 4 && (
                  <Button
                    onClick={nextStep}
                    disabled={demoLoading}
                    className="bg-[#2C3E50] hover:bg-[#1A252F] text-white"
                  >
                    {demoLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        Next Step
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                )}
                {demoStep === 4 && (
                  <Button
                    onClick={resetDemo}
                    variant="outline"
                    className="border-[#2C3E50] text-[#2C3E50] hover:bg-[#2C3E50] hover:text-white"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Restart Demo
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

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

  // Auto-generate AI title suggestions when optimize tab loads for title step
  useEffect(() => {
    if (
      activeTab === "optimize" && 
      optimizeStep === "title" && 
      !gptSuggestions && 
      !gptLoading && 
      titles[0] && 
      competitors.length > 0
    ) {
      fetchGptSuggestion()
    }
  }, [activeTab, optimizeStep, gptSuggestions, gptLoading, titles, competitors])

  // Auto-generate AI bullet point suggestions when optimize tab loads for bullet step
  useEffect(() => {
    if (
      activeTab === "optimize" && 
      optimizeStep === "bullet" && 
      !bulletIdeas && 
      !bulletIdeasLoading && 
      competitorDetails.length > 0
    ) {
      const generateBulletIdeas = async () => {
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
      }
      generateBulletIdeas()
    }
  }, [activeTab, optimizeStep, bulletIdeas, bulletIdeasLoading, competitorDetails])

  // Auto-generate AI description suggestions when optimize tab loads for description step
  useEffect(() => {
    if (
      activeTab === "optimize" && 
      optimizeStep === "description" && 
      !descriptionIdeas && 
      !descriptionIdeasLoading && 
      competitorDetails.length > 0
    ) {
      const generateDescriptionIdeas = async () => {
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
      }
      generateDescriptionIdeas()
    }
  }, [activeTab, optimizeStep, descriptionIdeas, descriptionIdeasLoading, competitorDetails])

  // Utility to add a step to completedSteps only if not already present
  function markStepCompleted(step: "title" | "bullet" | "description") {
    setCompletedSteps(prev => prev.includes(step) ? prev : [...prev, step])
  }

  // Handler for choosing a title
  function handleChooseTitle(idx: number) {
    setChosenTitleIdx(idx)
    setHasChosenTitleThisSession(true)
    markStepCompleted("title")
  }

  // When 5 bullets are chosen, mark bullet as completed
  useEffect(() => {
    if (chosenBulletIdxs.length === 5) {
      markStepCompleted("bullet")
    }
  }, [chosenBulletIdxs])

  // When a description is chosen, mark description as completed
  useEffect(() => {
    if (chosenDescriptionIdx !== null) {
      markStepCompleted("description")
    }
  }, [chosenDescriptionIdx])

  // Analyze performance improvements when preview tab is accessed with complete data
  useEffect(() => {
    if (
      activeTab === "preview" && 
      originalListingData && 
      chosenTitleIdx !== null && 
      chosenBulletIdxs.length === 5 && 
      chosenDescriptionIdx !== null &&
      !performanceMetrics &&
      !performanceLoading
    ) {
      const analyzePerformance = async () => {
        setPerformanceLoading(true)
        try {
          const optimizedListing = {
            title: titles[chosenTitleIdx] || originalListingData.title,
            bulletPoints: chosenBulletIdxs.map(idx => listingData.bulletPoints[idx]).filter(Boolean),
            description: descriptionDrafts[chosenDescriptionIdx] || originalListingData.description
          }

          const response = await fetch("/api/listing-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              originalListing: {
                title: originalListingData.title,
                bulletPoints: originalListingData.bulletPoints,
                description: originalListingData.description
              },
              optimizedListing,
              heroKeyword: listingData.heroKeyword
            })
          })

          if (!response.ok) {
            throw new Error(`Analysis failed: ${response.status}`)
          }

          const metrics = await response.json()
          setPerformanceMetrics(metrics)
        } catch (error: any) {
          console.error("Performance analysis error:", error)
          // Set fallback metrics if analysis fails
          setPerformanceMetrics({
            ctr_improvement: 10,
            conversion_improvement: 6,
            keyword_improvement: 25,
            total_sales_lift: 15
          })
        } finally {
          setPerformanceLoading(false)
        }
      }

      analyzePerformance()
    }
  }, [activeTab, originalListingData, chosenTitleIdx, chosenBulletIdxs, chosenDescriptionIdx, performanceMetrics, performanceLoading])

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F5B041] to-[#E67E22] flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white"></div>
      </div>
    )
  }

  if (currentPage === "landing") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F5B041] to-[#E67E22] relative overflow-hidden">
        <BackgroundPattern />

        <div className="container mx-auto px-4 py-8 relative z-10">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="inline-block p-8 bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border-4 border-[#2C3E50] transform hover:rotate-1 transition-transform duration-300 mb-8">
              <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#2C3E50] via-[#4A5568] to-[#718096] mb-6 tracking-tight">
                ListingLift<span className="text-[#F5B041]">.ai</span>
              </h1>
              <div className="flex items-center justify-center gap-3 mb-6">
                <Sparkles className="w-8 h-8 text-[#F5B041]" />
                <p className="text-3xl font-black text-gray-800">Turn Boring Listings Into Money Machines</p>
                <Fire className="w-8 h-8 text-[#F5B041]" />
              </div>
              <p className="text-xl text-gray-700 max-w-3xl mx-auto font-bold mb-8">
                AI-powered Amazon optimization that actually gets shoppers to click "Add to Cart" 🛒✨
              </p>

              <div className="flex gap-4 justify-center">
                <Button
                  onClick={() => setCurrentPage("signup")}
                  className="bg-gradient-to-r from-[#2C3E50] to-[#2C3E50] hover:from-[#1A252F] hover:to-[#1A252F] text-white font-black text-2xl px-16 py-8 rounded-3xl shadow-2xl transform hover:scale-105 transition-all duration-300 border-4 border-[#2C3E50] hover:border-[#1A252F]"
                >
                  <Rocket className="w-8 h-8 mr-4" />
                  Start Making Bank Now! 💰
                  <ArrowRight className="w-8 h-8 ml-4" />
                </Button>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => setCurrentPage("login")}
                  className="text-[#2C3E50] hover:text-[#1A252F] font-bold underline text-lg"
                >
                  Already have an account? Sign in here! 👋
                </button>
              </div>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
            {[
              { icon: TrendingUp, stat: "7%", label: "Avg Conversion Boost", color: "from-[#F5B041] to-[#F5B041]" },
              { icon: DollarSign, stat: "$1.3M+", label: "Revenue Generated", color: "from-[#F5B041] to-[#F5B041]" },
              { icon: Users, stat: "12K+", label: "Happy Sellers", color: "from-[#F5B041] to-[#F5B041]" },
              { icon: Star, stat: "4.9/5", label: "User Rating", color: "from-[#F5B041] to-[#F5B041]" },
            ].map((item, index) => (
              <Card
                key={index}
                className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-xl rounded-3xl overflow-hidden transform hover:scale-105 transition-all duration-300"
              >
                <CardContent className="p-6 text-center">
                  <div className={`inline-flex p-4 rounded-2xl bg-gradient-to-r ${item.color} mb-4`}>
                    <item.icon className="w-8 h-8 text-white" />
                  </div>
                  <div className="text-3xl font-black text-[#2C3E50] mb-2">{item.stat}</div>
                  <div className="text-sm font-bold text-[#4A5568]">{item.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Interactive Demo Section */}
          <InteractiveDemo />

          {/* Features Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
            {[
              {
                icon: Target,
                title: "Competitor Spy Mode 🕵️",
                description:
                  "See exactly what your competition is doing and learn from their best strategies",
                color: "from-[#4A5568] to-[#4A5568]",
                borderColor: "border-[#4A5568]",
                textColor: "text-white",
                descColor: "text-[#4A5568]",
              },
              {
                icon: Zap,
                title: "AI That Actually Gets It 🤖",
                description:
                  "Our AI speaks Amazon and knows what makes people click 'buy now' instead of scrolling past",
                color: "from-[#4A5568] to-[#4A5568]",
                borderColor: "border-[#F5B041]",
                textColor: "text-white",
                descColor: "text-[#4A5568]",
              },
              {
                icon: BarChart3,
                title: "Instant Results ⚡",
                description: "Watch your conversion rates go brrrr as soon as you implement our suggestions",
                color: "from-[#4A5568] to-[#4A5568]",
                borderColor: "border-[#718096]",
                textColor: "text-white",
                descColor: "text-[#4A5568]",
              },
            ].map((feature, index) => (
              <Card
                key={index}
                className={`bg-white/95 backdrop-blur-sm border-4 ${feature.borderColor} shadow-2xl rounded-3xl overflow-hidden transform hover:scale-105 transition-all duration-300`}
              >
                <CardHeader className={`bg-gradient-to-r ${feature.color} p-6`}>
                  <CardTitle className={`flex items-center gap-3 text-xl font-black ${feature.textColor}`}>
                    <feature.icon className="w-6 h-6" />
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className={`${feature.descColor} font-medium text-lg`}>{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Testimonials */}
          <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#4A5568] shadow-2xl rounded-3xl overflow-hidden mb-16">
            <CardHeader className="bg-gradient-to-r from-[#4A5568] to-[#718096] text-white p-8">
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
                    className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-2xl border-3 border-[#718096]"
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
            <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden inline-block">
              <CardContent className="p-12">
                <h2 className="text-4xl font-black text-gray-800 mb-4">Ready to Become an Amazon Legend? 👑</h2>
                <p className="text-xl text-gray-600 font-bold mb-8">
                  Join thousands of sellers who are already crushing it!
                </p>
                <Button
                  onClick={() => setCurrentPage("signup")}
                  className="bg-gradient-to-r from-[#2C3E50] to-[#2C3E50] hover:from-[#1A252F] hover:to-[#1A252F] text-white font-black text-2xl px-12 py-6 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300 border-4 border-[#2C3E50]"
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
      <div className="min-h-screen bg-gradient-to-br from-[#F5B041] to-[#E67E22] relative overflow-hidden">
        <BackgroundPattern />

        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="max-w-md mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-block p-6 bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border-4 border-[#2C3E50] mb-6">
                <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#2C3E50] via-[#4A5568] to-[#718096] mb-2">
                  ListingLift<span className="text-[#F5B041]">.ai</span>
                </h1>
                <p className="text-lg font-bold text-gray-700">Join the Revolution! ✨</p>
              </div>
            </div>

            {/* Signup Form */}
            <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-[#2C3E50] to-[#2C3E50] text-white p-8">
                <CardTitle className="text-2xl font-black text-center flex items-center justify-center gap-2">
                  <Sparkles className="w-6 h-6" />
                  Create Your Account
                  <Fire className="w-6 h-6" />
                </CardTitle>
                <CardDescription className="text-white text-center font-medium">
                  Ready to make your listings absolutely iconic? 💅
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <form onSubmit={handleSignup} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="email" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Mail className="w-5 h-5 text-[#F5B041]" />
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={authData.email}
                      onChange={(e) => setAuthData((prev) => ({ ...prev, email: e.target.value }))}
                      className="text-lg p-4 border-3 border-[#718096] rounded-2xl focus:border-[#2C3E50] focus:ring-4 focus:ring-[#F5B041]/20 font-medium"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="password" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-[#F5B041]" />
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Make it strong! 💪"
                      value={authData.password}
                      onChange={(e) => setAuthData((prev) => ({ ...prev, password: e.target.value }))}
                      className="text-lg p-4 border-3 border-[#718096] rounded-2xl focus:border-[#2C3E50] focus:ring-4 focus:ring-[#F5B041]/20 font-medium"
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
                    className="w-full bg-gradient-to-r from-[#2C3E50] to-[#2C3E50] hover:from-[#1A252F] hover:to-[#1A252F] text-white font-black text-xl px-8 py-6 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300 border-4 border-[#2C3E50] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="text-[#2C3E50] hover:text-[#1A252F] font-bold underline"
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
      <div className="min-h-screen bg-gradient-to-br from-[#F5B041] to-[#E67E22] relative overflow-hidden">
        <BackgroundPattern />

        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="max-w-md mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-block p-6 bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border-4 border-[#2C3E50] mb-6">
                <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#2C3E50] via-[#4A5568] to-[#718096] mb-2">
                  ListingLift<span className="text-[#F5B041]">.ai</span>
                </h1>
                <p className="text-lg font-bold text-gray-700">Welcome Back! 👋</p>
              </div>
            </div>

            {/* Login Form */}
            <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-[#2C3E50] to-[#2C3E50] text-white p-8">
                <CardTitle className="text-2xl font-black text-center flex items-center justify-center gap-2">
                  <Fire className="w-6 h-6" />
                  Sign In
                  <Sparkles className="w-6 h-6" />
                </CardTitle>
                <CardDescription className="text-white text-center font-medium">
                  Ready to optimize some listings? Let's go! 🚀
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <form onSubmit={handleLogin} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="email" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Mail className="w-5 h-5 text-[#F5B041]" />
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={authData.email}
                      onChange={(e) => setAuthData((prev) => ({ ...prev, email: e.target.value }))}
                      className="text-lg p-4 border-3 border-[#718096] rounded-2xl focus:border-[#2C3E50] focus:ring-4 focus:ring-[#F5B041]/20 font-medium"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="password" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-[#F5B041]" />
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Your password"
                      value={authData.password}
                      onChange={(e) => setAuthData((prev) => ({ ...prev, password: e.target.value }))}
                      className="text-lg p-4 border-3 border-[#718096] rounded-2xl focus:border-[#2C3E50] focus:ring-4 focus:ring-[#F5B041]/20 font-medium"
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
                    className="w-full bg-gradient-to-r from-[#2C3E50] to-[#2C3E50] hover:from-[#1A252F] hover:to-[#1A252F] text-white font-black text-xl px-8 py-6 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300 border-4 border-[#2C3E50] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="text-[#2C3E50] hover:text-[#1A252F] font-bold underline"
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
    <div className="min-h-screen bg-gradient-to-br from-[#F5B041] to-[#E67E22] relative overflow-hidden">
      <BackgroundPattern />

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Expanded Header Card */}
        <div className="w-full mb-8">
          <div className="w-full bg-gradient-to-r from-[#4A5568] to-[#4A5568] text-white rounded-3xl shadow-2xl border-4 border-[#4A5568] p-8 flex flex-col xl:flex-row gap-8 items-stretch relative">
            {/* Left Column: Branding & Quick Actions (1/3) */}
            <div className="flex flex-col justify-between xl:w-1/3 w-full">
              <div>
                <div className="flex items-center gap-4 mb-2">
                                  <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-[#F5B041] tracking-tight">
                  ListingLift<span className="text-[#F5B041]">.ai</span>
                </h1>
                  {user && (
                    <Button
                      onClick={handleLogout}
                      className="bg-[#E67E22] hover:bg-[#D35400]  text-white p-2 rounded-xl ml-2"
                      size="sm"
                      aria-label="Logout"
                    >
                      <LogOut className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-[#F5B041]" />
                  <span className="text-xl font-bold text-white drop-shadow">Amazon Listing Optimizer</span>
                  <Fire className="w-5 h-5 text-[#F5B041]" />
                </div>
                <p className="text-md text-white max-w-2xl font-medium mb-2">
                  Turn your boring listings into conversion machines with AI that actually gets it 🚀
                </p>
                {user && (
                  <p className="text-xs text-white mt-2">Welcome back, {user.email}! 👋</p>
                )}
              </div>
              <div className="mt-6 border-t border-[#718096] pt-4">
                <h2 className="text-lg font-black text-white mb-2">Quick Start Guide ⚡</h2>
                {/* Step-by-step instructional copy instead of buttons */}
                <div className="mb-4">
                  {activeTab === "input" && (
                    <div className="text-white font-medium text-md">
                      Enter your product's ASIN and hero keyword to get started. We'll analyze your listing and competitors.<br />
                      <br />
                      Try loading sample data to see how it works!
                    </div>
                  )}
                  {activeTab === "optimize" && optimizeStep === "title" && (
                    <div className="text-white font-medium text-md">
                      Review your current title and explore AI-powered suggestions. Move through each section to optimize your listing.
                    </div>
                  )}
                  {activeTab === "optimize" && optimizeStep === "bullet" && (
                    <div className="text-white font-medium text-md">
                      Choose 5 bullet points. Use AI suggestions or competitor examples to make each one count.
                    </div>
                  )}
                  {activeTab === "optimize" && optimizeStep === "description" && (
                    <div className="text-white font-medium text-md">
                      Craft your product description with help from AI and competitor examples. Pick your favorite or combine ideas.
                    </div>
                  )}
                  {activeTab === "preview" && (
                    <div className="text-white font-medium text-md">
                      Here's how your optimized listing will appear. Copy your final listing attributes over to Seller Central for upload.
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Right Column: Keywords Section or Revenue Calculator (2/3) */}
            <div className="flex flex-col justify-between bg-white rounded-2xl p-6 border-2 border-[#718096] xl:w-2/3 w-full mt-8 xl:mt-0">
              {activeTab === "preview" ? (
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border-1 border-[#718096]">
                  <div className="bg-[#718096] rounded-lg p-4 mb-4 -m-6 mb-6">
                    <h4 className="font-black text-xl text-white mb-0 flex items-center gap-2">
                      <DollarSign className="w-6 h-6 text-white" />
                      Revenue Impact Calculator
                    </h4>
                  </div>
                  <div className="space-y-4">
                    {/* Current Revenue Input */}
                    <div>
                      <Label className="text-sm font-bold text-[#4A5568] mb-2 block">
                        Current Monthly Revenue ($)
                      </Label>
                      <Input
                        type="number"
                        placeholder="Enter current monthly revenue"
                        value={currentRevenue}
                        onChange={(e) => setCurrentRevenue(e.target.value)}
                        className="bg-gray-50 border-2 border-[#718096] text-[#334155] focus:border-[#334155] focus:ring-4 focus:ring-gray-200"
                      />
                    </div>
                    
                    {currentRevenue && !isNaN(Number(currentRevenue)) && Number(currentRevenue) > 0 && performanceMetrics && (
                      <>
                        <div className="bg-white p-4 rounded-lg border-2 border-orange-200">
                          <div className="text-center">
                            <div className="text-2xl font-black text-[#334155] mb-1">
                              ${(Number(currentRevenue) * (performanceMetrics.total_sales_lift / 100)).toLocaleString()}
                            </div>
                            <div className="text-sm text-[#4A5568]">Projected monthly revenue increase</div>
                          </div>
                        </div>
                        <div className="text-sm text-[#4A5568] space-y-2">
                          <div className="flex justify-between">
                            <span>Current monthly sales:</span>
                            <span className="font-medium">${Number(currentRevenue).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Optimized projection:</span>
                            <span className="font-medium text-green-600">
                              ${(Number(currentRevenue) * (1 + performanceMetrics.total_sales_lift / 100)).toLocaleString()}
                            </span>
                          </div>
                          <div className="border-t pt-2 flex justify-between font-bold">
                            <span>Monthly increase:</span>
                            <span className="text-green-600">
                              +${(Number(currentRevenue) * (performanceMetrics.total_sales_lift / 100)).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-center mt-2 text-xs text-gray-500">
                            Based on {performanceMetrics.total_sales_lift}% projected sales lift
                          </div>
                        </div>
                      </>
                    )}
                    
                    {(!currentRevenue || isNaN(Number(currentRevenue)) || Number(currentRevenue) <= 0) && (
                      <div className="bg-white p-4 rounded-lg border-2 border-gray-300">
                        <div className="text-center text-gray-500">
                          <div className="text-lg font-medium mb-1">Enter your revenue above</div>
                          <div className="text-sm">to see your projected increase</div>
                        </div>
                      </div>
                    )}

                    {(!performanceMetrics && currentRevenue && !isNaN(Number(currentRevenue)) && Number(currentRevenue) > 0) && (
                      <div className="bg-white p-4 rounded-lg border-2 border-gray-300">
                        <div className="text-center text-gray-500">
                          <div className="text-lg font-medium mb-1">Complete optimization steps</div>
                          <div className="text-sm">to see revenue projections</div>
                        </div>
                      </div>
                    )}

                    {performanceLoading && (
                      <div className="bg-white p-4 rounded-lg border-2 border-gray-300">
                        <div className="text-center text-[#4A5568]">
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#718096]"></div>
                            Analyzing performance improvements...
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-black text-[#2C3E50] mb-4 flex items-center gap-2">
                    <BarChart3 className="w-6 h-6 text-[#F5B041]" />
                    Amazon Keywords
                  </h2>
                  {activeTab === "input" ? (
                    <div className="flex flex-col gap-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-[#718096] shadow-inner">
                      <div className="text-lg font-bold text-[#2C3E50]">
                        Our AI analyzes your product and your top competitors to uncover the exact keywords and phrases that drive clicks and sales on Amazon.
                      </div>
                      <div className="text-md text-[#4A5568]">
                        We don't just guess—we use real data and advanced language models to identify what's missing, what's working, and what can set your listing apart.
                      </div>
                      <ul className="list-disc list-inside text-[#2C3E50] font-medium space-y-1 pl-2">
                        <li>
                          <span className="font-bold">A breakdown of high-value keywords</span> your listing should target
                        </li>
                        <li>
                          <span className="font-bold">Actionable, AI-powered suggestions</span> to boost your visibility and conversion rate
                        </li>
                        <li>
                          <span className="font-bold">Your top 10 strongest competitors' listing data</span>
                        </li>
                      </ul>
                      <div className="text-md text-[#2C3E50] font-semibold mt-2">
                        Let our AI do the heavy lifting—so you can focus on growing your business!
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1">
                        {keywordGapLoading && <div className="text-blue-600 font-bold">Analyzing keyword gaps...</div>}
                        {keywordGapError && <div className="text-red-600 font-bold">{keywordGapError}</div>}
                        {keywordGapResult && (
                          <div className="space-y-4">
                            {/* High Value Gaps */}
                            <div>
                              <div className="font-black text-md mb-1 flex items-center gap-2">
                                <span className="text-black font-black">High Value Gaps</span>
                                <span className="text-xs text-gray-500">(Add these to your title!)</span>
                              </div>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {(keywordGapResult.high_value_gaps || []).length > 0 ? (
                                  keywordGapResult.high_value_gaps.map((kw: string) => (
                                    <Badge key={kw} className="bg-[#718096] text-white border-[#718096] font-bold text-xs">{kw}</Badge>
                                  ))
                                ) : (
                                  <span className="text-xs text-gray-500">No high value gaps found.</span>
                                )}
                              </div>
                            </div>
                            {/* Missing Keywords */}
                            <div>
                              <div className="font-black text-md mb-1 flex items-center gap-2">
                                <span className="text-black font-black">Missing Keywords</span>
                                <span className="text-xs text-gray-500">(From competitors, not in your title)</span>
                              </div>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {(keywordGapResult.missing_keywords || []).length > 0 ? (
                                  keywordGapResult.missing_keywords.map((kw: any, i: number) => (
                                    <Badge key={kw.keyword + i} className="bg-white text-[#2C3E50] border-[#718096] font-bold text-xs">{kw.keyword}</Badge>
                                  ))
                                ) : (
                                  <span className="text-xs text-gray-500">No missing keywords found.</span>
                                )}
                              </div>
                            </div>
                            {/* Our Existing Keywords */}
                            <div>
                              <div className="font-black text-md mb-1 flex items-center gap-2">
                                <span className="text-black font-black">Your Title Keywords</span>
                              </div>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {(keywordGapResult.our_existing_keywords || []).length > 0 ? (
                                  keywordGapResult.our_existing_keywords.map((kw: string) => (
                                    <Badge key={kw} className="bg-white text-[#2C3E50] border-[#718096] font-bold text-xs">{kw}</Badge>
                                  ))
                                ) : (
                                  <span className="text-xs text-gray-500">No keywords found in your title.</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8 bg-white/90 backdrop-blur-sm p-2 rounded-2xl shadow-xl border-4 border-[#718096]">
            <TabsTrigger
              value="input"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#2C3E50] data-[state=active]:to-[#2C3E50] data-[state=active]:text-white font-bold rounded-xl transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:scale-105"
            >
              <Target className="w-5 h-5" />
              Input Data
            </TabsTrigger>
            <TabsTrigger
              value="optimize"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#2C3E50] data-[state=active]:to-[#2C3E50] data-[state=active]:text-white font-bold rounded-xl transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:scale-105"
            >
              <Zap className="w-5 h-5" />
              Optimize
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#2C3E50] data-[state=active]:to-[#2C3E50] data-[state=active]:text-white font-bold rounded-xl transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:scale-105"
            >
              <TrendingUp className="w-5 h-5" />
              Preview
            </TabsTrigger>
          </TabsList>
          {/* Show OptimizeNav only when Optimize tab is active */}
          {activeTab === "optimize" && (
            <OptimizeNav
              step={optimizeStep}
              completedSteps={completedSteps}
              onStepChange={step => {
                // Only allow going to a step if all previous steps are completed
                if (
                  (step === "title") ||
                  (step === "bullet" && completedSteps.includes("title")) ||
                  (step === "description" && completedSteps.includes("title") && completedSteps.includes("bullet"))
                ) {
                  setOptimizeStep(step)
                }
              }}
            />
          )}

          <TabsContent value="input" className="space-y-6">
            <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-[#718096] to-[#718096] text-white p-8">
                <CardTitle className="text-3xl font-black flex items-center gap-3">
                  <Rocket className="w-8 h-8" />
                  Let's Get This Bread! 🍞
                </CardTitle>
                <CardDescription className="text-white text-lg font-medium">
                  Just drop your ASIN and hero keyword - we'll handle the rest ✨
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
                  <div className="space-y-3">
                    <Label htmlFor="asin" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Target className="w-5 h-5 text-[#F5B041]" />
                      Your Product ASIN
                    </Label>
                    <Input
                      id="asin"
                      placeholder="B08N5WRWNW"
                      value={listingData.asin}
                      onChange={(e) => setListingData((prev) => ({ ...prev, asin: e.target.value }))}
                      className="text-lg p-4 border-3 border-[#718096] rounded-2xl focus:border-[#2C3E50] focus:ring-4 focus:ring-[#F5B041]/20 font-medium"
                    />
                    <p className="text-sm text-gray-600 font-medium">
                      That 10-character Amazon code that identifies your product 🎯
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="heroKeyword" className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <Fire className="w-5 h-5 text-[#F5B041]" />
                      Hero Keyword
                    </Label>
                    <Input
                      id="heroKeyword"
                      placeholder="wireless bluetooth headphones"
                      value={listingData.heroKeyword}
                      onChange={(e) => setListingData((prev) => ({ ...prev, heroKeyword: e.target.value }))}
                      className="text-lg p-4 border-3 border-[#718096] rounded-2xl focus:border-[#2C3E50] focus:ring-4 focus:ring-[#F5B041]/20 font-medium"
                    />
                    <p className="text-sm text-gray-600 font-medium">The main keyword that's gonna make you rich 💰</p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-center justify-center gap-4 pt-4">
                  <Button
                    className="bg-gradient-to-r from-[#4A5568] to-[#4A5568] hover:from-[#2C3E50] hover:to-[#2C3E50] text-white font-bold rounded-xl border-2 border-[#4A5568] text-md md:text-lg px-6 py-4 md:px-8 md:py-6"
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
                    className="bg-gradient-to-r from-[#2C3E50] to-[#2C3E50] hover:from-[#1A252F] hover:to-[#1A252F] text-white font-black text-xl px-12 py-6 rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300 border-4 border-[#2C3E50] hover:border-[#1A252F]"
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
            {optimizeStep === "description" ? (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Column 1: Your Description(s) */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-[#718096] to-[#718096] text-white p-6">
                    <CardTitle className="text-xl font-black">Your Current Description</CardTitle>
                    <CardDescription className="text-white font-medium">
                      Time to make your listing absolutely iconic 💅
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    {descriptionDrafts.map((desc, idx) => (
                                              <div key={idx} className={`flex flex-col gap-1 mb-4 border-2 rounded-xl ${chosenDescriptionIdx === idx ? 'border-green-500 bg-gradient-to-br from-gray-50 to-gray-200' : ' bg-gradient-to-br from-gray-50 to-gray-200'}`}>
                        <SpellcheckTextarea
                          rows={11}
                          value={desc}
                          onChange={value => setDescriptionDrafts(prev => prev.map((d, i) => i === idx ? value : d))}
                          className="border-3 border-[#718096] rounded-2xl focus:border-[#334155] focus:ring-4 focus:ring-[#718096]/20 font-medium w-full"
                          placeholder={`Description ${idx + 1}`}
                        />
                        <div className="flex gap-2 mt-1 justify-end">
                          <Button
                            type="button"
                            size="sm"
                            className={`font-bold border-2 rounded-xl ${chosenDescriptionIdx === idx ? 'bg-[#334155] text-white border-[#334155]' : 'bg-[#718096]/20 text-[#334155] border-[#334155]'}`}
                            onClick={() => setChosenDescriptionIdx(idx)}
                          >
                            ^ Choose Description
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="font-bold border-2 border-[#DC2626] text-[#DC2626] rounded-xl bg-gradient-to-br from-gray-50 to-gray-200 hover:bg-red-50"
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
                      className="bg-[#718096] text-[#334155] border-[#718096] hover:bg-[#5F6C81] hover:text-white"
                      onClick={() => setDescriptionDrafts(prev => [...prev, ""])}
                    >
                      +
                    </Button>
                    <Button
                      type="button"
                      className="bg-[#334155] hover:bg-[#1E293B] text-white font-bold rounded-xl mt-4 w-full"
                      onClick={() => { setPreviewMode(true); setActiveTab('preview'); }}
                    >
                      Next Step: Preview
                    </Button>
                  </CardContent>
                </Card>
                {/* Column 2: AI Description Suggestions */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-[#718096] to-[#718096] text-white p-6">
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Lightbulb className="w-6 h-6" />
                      AI Description Suggestions
                    </CardTitle>
                    <CardDescription className="text-white font-medium">
                      Your personal conversion coach is here! 🚀
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <Button
                      type="button"
                      className="w-full text-xs font-bold bg-gradient-to-r from-[#334155] to-[#334155] hover:from-[#1E293B] hover:to-[#1E293B] border-2 border-[#334155] text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 mb-2"
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
                      {descriptionIdeasLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                          Generating GPT-4o Suggestion...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Get AI Optimized Description Ideas
                        </>
                      )}
                    </Button>
                    {descriptionIdeasError && <div className="text-xs text-red-600 font-bold mt-2">{descriptionIdeasError}</div>}
                    {descriptionIdeas && (
                      <div className="space-y-4">
                        {descriptionIdeas.map((idea, idx) => (
                          <div key={idx} className="border-3 border-blue-400 rounded-2xl p-4 space-y-2 bg-gradient-to-br from-gray-50 to-gray-200 shadow-lg flex flex-col">
                            <div className="font-bold text-md text-gray-900 mb-2">{idea}</div>
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                className="bg-[#334155] hover:bg-[#1E293B] text-white font-bold border-2 border-[#334155] rounded-xl shadow"
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
                                className="border-[#DC2626] text-[#DC2626] font-bold rounded-xl shadow"
                                onClick={() => setDescriptionIdeas(prev => prev ? prev.filter((_, i) => i !== idx) : prev)}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {!descriptionIdeas && !descriptionIdeasLoading && (
                      <div className="text-center py-12">
                        <div className="text-6xl mb-4">🤖</div>
                        <p className="text-gray-500 font-medium">Generate suggestions to unlock the AI magic!</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                {/* Column 3: Competitor Descriptions */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-[#718096] to-[#718096] text-white p-6">
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Target className="w-6 h-6" />
                      Competitor Descriptions
                    </CardTitle>
                    <CardDescription className="text-white font-medium">
                      Spying on the competition for "{listingData.heroKeyword}" 👀
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {competitorDetails.map((comp, idx) => (
                      <div key={comp.asin || idx} className="mb-4 border-2 border-gray-200 rounded-xl p-3 bg-gradient-to-br from-gray-50 to-gray-200">
                        <div className="font-bold text-gray-800 mb-1">{comp.title || <span className="italic text-gray-400">No title</span>}</div>
                        <div className="mb-1">
                          <span className="font-bold text-gray-600 text-xs">Description:</span>
                          <div className="text-xs text-gray-700 bg-white rounded px-2 py-1 border border-gray-200 mt-1 whitespace-pre-wrap">
                            {comp.description ? comp.description : <span className="text-gray-400 italic">No description found.</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : optimizeStep === "bullet" ? (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Column 1: Current Bullet Points */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-[#718096] to-[#718096] text-white p-6">
                    <CardTitle className="text-xl font-black">Your Current Bullet Points (Choose 5)</CardTitle>
                    <CardDescription className="text-white font-medium">
                      Time to make your listing absolutely iconic 💅
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="space-y-3">
                      {listingData.bulletPoints.map((bp, idx) => {
                        const isSelected = chosenBulletIdxs.includes(idx)
                        const canSelectMore = isSelected || chosenBulletIdxs.length < 5
                        return (
                          <div
                            key={idx}
                            className={`flex flex-col gap-1 mb-4 border-2 rounded-xl ${isSelected ? 'border-green-500 bg-gradient-to-br from-gray-50 to-gray-200' : 'bg-gradient-to-br from-gray-50 to-gray-200'}`}
                          >
                            <SpellcheckTextarea
                              rows={5}
                              value={bp}
                              onChange={value => setListingData(prev => {
                                const newBullets = [...prev.bulletPoints]
                                newBullets[idx] = value
                                return { ...prev, bulletPoints: newBullets }
                              })}
                              className="border-3 border-[#718096] rounded-2xl focus:border-[#334155] focus:ring-4 focus:ring-[#718096]/20 font-medium w-full"
                              placeholder={`Bullet Point ${idx + 1}`}
                            />
                            <div className="flex gap-2 mt-1 justify-end">
                              <Button
                                type="button"
                                size="sm"
                                className={`font-bold border-2 rounded-xl ${isSelected ? 'bg-[#334155] text-white border-[#334155]' : 'bg-[#718096]/20 text-[#334155] border-[#334155]'}`}
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
                                className="font-bold border-2 border-[#DC2626] text-[#DC2626] rounded-xl bg-gradient-to-br from-gray-50 to-gray-200 hover:bg-red-50"
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
                      <Button type="button" size="sm" variant="outline" className="bg-[#718096] text-[#334155] border-[#718096] hover:bg-[#5F6C81] hover:text-white" onClick={() => setListingData(prev => ({ ...prev, bulletPoints: [...prev.bulletPoints, ""] }))}>
                        + Add Bullet Point
                      </Button>
                      {optimizeStep === "bullet" && (
                        <Button
                          type="button"
                          className="bg-[#334155] hover:bg-[#1E293B] text-white font-bold rounded-xl mt-4 w-full"
                          onClick={() => setOptimizeStep("description")}
                          disabled={chosenBulletIdxs.length !== 5}
                        >
                          Next Step: Description
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
                {/* Column 2: AI Suggestions & Gap Analysis */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-[#718096] to-[#718096] text-white p-6">
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Lightbulb className="w-6 h-6" />
                      AI Bullet Point Suggestions
                    </CardTitle>
                    <CardDescription className="text-white font-medium">
                      Your personal conversion coach is here! 🚀
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <Button
                      type="button"
                      className="w-full text-xs font-bold bg-gradient-to-r from-[#2C3E50] to-[#2C3E50] hover:from-[#1A252F] hover:to-[#1A252F] border-2 border-[#2C3E50] rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 mb-2"
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
                      {bulletIdeasLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                          Generating GPT-4o Suggestion...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Get AI Optimized Bullet Point Ideas
                        </>
                      )}
                    </Button>
                    {bulletIdeasError && <div className="text-xs text-red-600 font-bold mt-2">{bulletIdeasError}</div>}
                    {/* AI Bullet Point Ideas Cards */}
                    {bulletIdeas && (
                      <div className="space-y-4">
                        {bulletIdeas.map((idea, idx) => (
                          <div key={idx} className="border-3 border-blue-400 rounded-2xl p-4 space-y-2 bg-gradient-to-br from-gray-50 to-gray-200 shadow-lg flex flex-col">
                            <div className="font-bold text-md text-gray-900 mb-2">{idea}</div>
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                className="bg-[#334155] hover:bg-[#1E293B] text-white font-bold border-2 border-[#334155] rounded-xl shadow"
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
                                className="border-[#DC2626] text-[#DC2626] font-bold rounded-xl shadow"
                                onClick={() => setBulletIdeas(prev => prev ? prev.filter((_, i) => i !== idx) : prev)}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {!bulletIdeas && !bulletIdeasLoading && (
                      <div className="text-center py-12">
                        <div className="text-6xl mb-4">🤖</div>
                        <p className="text-gray-500 font-medium">Generate suggestions to unlock the AI magic!</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                {/* Column 3: Competitor Bullet Points */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-[#718096] to-[#718096] text-white p-6">
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Target className="w-6 h-6" />
                      Competitor Bullet Points
                    </CardTitle>
                    <CardDescription className="text-white font-medium">
                      Spying on the competition for "{listingData.heroKeyword}" 👀
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {/* Show top 10 competitors' bullet points only (no description) */}
                    {competitorDetails.map((comp, idx) => (
                      <div key={comp.asin || idx} className="mb-4 border-2 border-gray-200 rounded-xl p-3 bg-gradient-to-br from-gray-50 to-gray-200">
                        <div className="font-bold text-gray-800 mb-1">{comp.title || <span className="italic text-gray-400">No title</span>}</div>
                        <div className="mb-1">
                          <span className="font-bold text-gray-600 text-xs">Bullet Points:</span>
                          <ul className="ml-4 mt-1 space-y-1">
                            {(comp.bullet_points || "").split("\n").filter(Boolean).length > 0 ? (
                              (comp.bullet_points || "").split("\n").filter(Boolean).map((bp: string, i: number) => (
                                <li key={i} className="text-xs text-gray-700 bg-white rounded px-2 py-1 border border-gray-200">• {bp}</li>
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
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-[#718096] to-[#718096] text-white p-6">
                    <CardTitle className="text-xl font-black">Your Current Listing Title</CardTitle>
                    <CardDescription className="text-white font-medium">
                      Time to make your listing absolutely iconic 💅
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="space-y-3">
                      <Label className="text-sm font-black text-gray-800 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-green-500" />
                        Current Title
                      </Label>
                      <div className={`bg-gradient-to-br from-gray-50 to-gray-200 border-2 rounded-xl p-4 font-bold text-gray-800 mb-4 ${chosenTitleIdx === null ? 'border-green-500 ring-2 ring-green-400' : 'border-green-200'}`}
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
                          <SpellcheckTextarea
                            rows={5}
                            placeholder="Make it pop! Front-load your keyword and add some spice... 🌶️"
                            value={title}
                            onChange={value => updateTitle(idx + 1, value)}
                            className="border-3 border-[#718096] rounded-2xl focus:border-[#334155] focus:ring-4 focus:ring-[#718096]/20 font-medium w-full"
                          />
                          <div className="flex gap-2 mt-2 justify-end">
                            <Button
                              type="button"
                              size="sm"
                              className={`font-bold border-2 rounded-xl ${chosenTitleIdx === idx + 1 ? 'bg-[#334155] text-white border-[#334155]' : 'bg-[#718096]/20 text-[#334155] border-[#334155]'}`}
                              onClick={() => handleChooseTitle(idx + 1)}
                            >
                              ^ Choose Title
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="font-bold border-2 border-[#DC2626] text-[#DC2626] rounded-xl bg-gradient-to-br from-gray-50 to-gray-200 hover:bg-red-50"
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
                          className="border-[#718096] text-[#718096] hover:bg-[#718096] hover:text-white"
                          onClick={addTitle}
                          aria-label="Add another title"
                        >
                          + Add Another Title
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="font-bold border-2 rounded-xl bg-[#334155] text-white border-[#334155] hover:bg-[#1E293B] disabled:opacity-50 disabled:cursor-not-allowed"
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
                              // Set original listing data if not already set, using the fetched product data
                              setOriginalListingData(prev => prev ? prev : {
                                asin: listingData.asin,
                                heroKeyword: listingData.heroKeyword,
                                title: data.product?.title || "",
                                bulletPoints: (data.product?.bullet_points || "").split("\n").filter(Boolean),
                                description: data.product?.description || ""
                              })
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
                              markStepCompleted("bullet")
                              setOptimizeStep("bullet")
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
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-[#718096] to-[#718096] text-white p-6">
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Lightbulb className="w-6 h-6" />
                      AI Title Suggestions
                    </CardTitle>
                    <CardDescription className="text-white font-medium">
                      Your personal conversion coach is here! 🚀
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {/* Add GPT-4o Suggestion Button */}
                    <div className="mb-4">
                      <Button
                        onClick={fetchGptSuggestion}
                        disabled={gptLoading || !titles[0] || competitors.length === 0}
                        className="w-full text-xs font-bold bg-gradient-to-r from-[#2C3E50] to-[#2C3E50] hover:from-[#1A252F] hover:to-[#1A252F] border-2 border-[#2C3E50] rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 mb-2"
                      >
                        {gptLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                            Generating GPT-4o Suggestion...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Get AI Optimized Title Ideas
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
                              <span className="bg-[#F5B041]/20 text-[#2C3E50] rounded px-2 py-1">Priority: {sugg.priority}</span>
                            </div>
                            <div className="text-xs text-gray-700 font-medium mt-1">{sugg.justification}</div>
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                className="bg-[#334155] hover:bg-[#1E293B] text-white font-bold border-2 border-[#334155] rounded-xl shadow"
                                onClick={() => handleAcceptSuggestion(sugg.title)}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-[#DC2626] text-[#DC2626] font-bold rounded-xl shadow"
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
                          className="border-3 border-[#F5B041] rounded-2xl p-4 space-y-3 bg-gradient-to-br from-[#F5B041]/10 to-[#F5B041]/20 hover:shadow-lg transition-all duration-300"
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
                                    ? "bg-[#F5B041] border-[#F5B041]"
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
                              className="text-xs font-bold border-2 border-[#F5B041] text-[#2C3E50]"
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
                            className="w-full text-xs font-bold bg-gradient-to-r from-[#F5B041] to-[#F5B041] hover:from-[#E8A133] hover:to-[#E8A133] border-2 border-[#F5B041] rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                          >
                            Apply This Fire 🔥
                          </Button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Competitor Analysis - Right Column */}
                <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#718096] shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-[#718096] to-[#718096] text-white p-6">
                    <CardTitle className="flex items-center gap-2 text-xl font-black">
                      <Target className="w-6 h-6" />
                      Competitor Titles 
                    </CardTitle>
                    <CardDescription className="text-white font-medium">
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
                            className="border-2 border-gray-200 rounded-2xl p-4 flex flex-col gap-2 bg-gradient-to-br from-gray-50 to-gray-200 hover:shadow-lg transition-all duration-300"
                          >
                            <div className="flex items-center justify-between">
                              <h4 className="font-black text-sm text-gray-800 break-words whitespace-normal w-full">{comp.title}</h4>
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
            <Card className="bg-white/95 backdrop-blur-sm border-4 border-[#4A5568] shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-[#4A5568] to-[#718096] text-white p-8">
                <CardTitle className="text-3xl font-black flex items-center gap-3">
                  <TrendingUp className="w-8 h-8" />
                  Your Listing Preview 👀
                </CardTitle>
                <CardDescription className="text-white text-lg font-medium">
                  See your transformation side-by-side. Copy and paste the optimized listing attributes into your Amazon listing to see your sales soar!
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8">


                {/* Side-by-side comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Before (Original) */}
                  <div className="bg-gray-50 rounded-xl border p-6 flex flex-col gap-6">
                    <h3 className="font-black text-lg mb-2 text-gray-700">Original Listing 📝</h3>
                    {/* Title */}
                    <div>
                      <div className="text-xs font-bold text-gray-500 mb-1">Title</div>
                      <div className="flex items-center gap-2">
                        <span className="p-3 bg-white rounded border flex-1 font-semibold text-gray-800">
                          {originalListingData?.title || "No original title"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-[#718096] hover:bg-[#4A5568] text-white px-3 py-1 rounded-lg text-sm transition-colors duration-200"
                          onClick={async () => {
                            await navigator.clipboard.writeText(originalListingData?.title || "")
                            setCopiedField('before-title')
                            setTimeout(() => setCopiedField(null), 1200)
                          }}
                        >
                          {copiedField === 'before-title' ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                    {/* Bullet Points */}
                    <div>
                      <div className="text-xs font-bold text-gray-500 mb-1">Bullet Points</div>
                      <ul className="space-y-2">
                        {(originalListingData?.bulletPoints || []).map((bp, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="p-2 bg-white rounded border flex-1 text-sm">{bp}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-[#718096] hover:bg-[#4A5568] text-white px-3 py-1 rounded-lg text-sm transition-colors duration-200"
                              onClick={async () => {
                                await navigator.clipboard.writeText(bp)
                                setCopiedField('before-bullet-' + i)
                                setTimeout(() => setCopiedField(null), 1200)
                              }}
                            >
                              {copiedField === 'before-bullet-' + i ? 'Copied!' : 'Copy'}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* Description */}
                    <div>
                      <div className="text-xs font-bold text-gray-500 mb-1">Description</div>
                      <div className="flex items-center gap-2">
                        <span className="p-3 bg-white rounded border flex-1 text-sm">
                          {originalListingData?.description || "No original description"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-[#718096] hover:bg-[#4A5568] text-white px-3 py-1 rounded-lg text-sm transition-colors duration-200"
                          onClick={async () => {
                            await navigator.clipboard.writeText(originalListingData?.description || "")
                            setCopiedField('before-description')
                            setTimeout(() => setCopiedField(null), 1200)
                          }}
                        >
                          {copiedField === 'before-description' ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* After (Optimized) */}
                  <div className="bg-gray-50 rounded-xl border p-6 flex flex-col gap-6">
                    <h3 className="font-black text-lg mb-2 text-black-700">Optimized Listing 🚀</h3>
                    {/* Title */}
                    <div>
                      <div className="text-xs font-bold text-gray-500 mb-1">Title</div>
                      <div className="flex items-center gap-2">
                        <span className="p-3 bg-white rounded border flex-1 font-semibold text-black-700">
                          {titles[chosenTitleIdx ?? 0] || listingData.title || "No title chosen"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-[#718096] hover:bg-[#4A5568] text-white px-3 py-1 rounded-lg text-sm transition-colors duration-200"
                          onClick={async () => {
                            await navigator.clipboard.writeText(titles[chosenTitleIdx ?? 0] || listingData.title || "")
                            setCopiedField('after-title')
                            setTimeout(() => setCopiedField(null), 1200)
                          }}
                        >
                          {copiedField === 'after-title' ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                    {/* Bullet Points */}
                    <div>
                      <div className="text-xs font-bold text-gray-500 mb-1">Bullet Points</div>
                      <ul className="space-y-2">
                        {chosenBulletIdxs.length > 0
                          ? chosenBulletIdxs.map((idx, i) => (
                              <li key={i} className="flex items-center gap-2">
                                <span className="p-2 bg-white rounded border flex-1 text-sm">{listingData.bulletPoints[idx]}</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="bg-[#718096] hover:bg-[#4A5568] text-white px-3 py-1 rounded-lg text-sm transition-colors duration-200"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(listingData.bulletPoints[idx] || "")
                                    setCopiedField('after-bullet-' + idx)
                                    setTimeout(() => setCopiedField(null), 1200)
                                  }}
                                >
                                  {copiedField === 'after-bullet-' + idx ? 'Copied!' : 'Copy'}
                                </Button>
                              </li>
                            ))
                          : <li className="text-sm text-gray-500 font-medium p-2 bg-white rounded border">No bullet points chosen.</li>}
                      </ul>
                    </div>
                    {/* Description */}
                    <div>
                      <div className="text-xs font-bold text-gray-500 mb-1">Description</div>
                      <div className="flex items-center gap-2">
                        <span className="p-3 bg-white rounded border flex-1 text-sm">
                          {chosenDescriptionIdx !== null && descriptionDrafts[chosenDescriptionIdx]
                            ? descriptionDrafts[chosenDescriptionIdx]
                            : "No description chosen."}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-[#718096] hover:bg-[#4A5568] text-white px-3 py-1 rounded-lg text-sm transition-colors duration-200"
                          onClick={async () => {
                            await navigator.clipboard.writeText(
                              (chosenDescriptionIdx !== null && descriptionDrafts[chosenDescriptionIdx]) || ""
                            )
                            setCopiedField('after-description')
                            setTimeout(() => setCopiedField(null), 1200)
                          }}
                        >
                          {copiedField === 'after-description' ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                    </div>
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
