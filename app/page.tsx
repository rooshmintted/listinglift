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
                >
                  <Fire className="w-6 h-6 mr-3" />
                  Let's Gooo! 🚀
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
              <div className="flex-1 flex items-center justify-center text-gray-400 italic text-sm">
                {/* Placeholder for future keyword content */}
                (Keyword tools coming soon)
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

                <div className="text-center pt-4">
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
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Competitor Analysis - Left Column */}
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

              {/* Editable Content - Middle Column */}
              <Card className="bg-white/95 backdrop-blur-sm border-4 border-green-400 shadow-2xl rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-6">
                  <CardTitle className="text-xl font-black">Your Listing Glow-Up ✨</CardTitle>
                  <CardDescription className="text-green-100 font-medium">
                    Time to make your listing absolutely iconic 💅
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-3">
                    <Label className="text-sm font-black text-gray-800 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-green-500" />
                      Product Titles
                    </Label>
                    {titles.map((title, idx) => (
                      <div key={idx} className="flex items-center gap-2 mb-2">
                        <Textarea
                          rows={5}
                          placeholder="Make it pop! Front-load your keyword and add some spice... 🌶️"
                          value={title}
                          onChange={e => updateTitle(idx, e.target.value)}
                          className="border-3 border-green-300 rounded-2xl focus:border-green-500 focus:ring-4 focus:ring-green-200 font-medium flex-1"
                        />
                        {titles.length > 1 && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            onClick={() => removeTitle(idx)}
                            className="ml-2 scale-50 p-1 h-6 w-6 min-w-0 min-h-0 flex items-center justify-center"
                            aria-label="Remove title"
                          >
                            –
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addTitle}
                      className="mt-2"
                      aria-label="Add another title"
                    >
                      + Add Another Title
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* AI Suggestions - Right Column */}
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
            </div>
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
                <div className="bg-white border-4 border-purple-300 rounded-3xl p-8 space-y-6 shadow-xl">
                  <div className="flex items-start gap-6">
                    <div className="w-40 h-40 bg-gradient-to-br from-orange-200 to-pink-200 rounded-2xl flex items-center justify-center border-3 border-orange-300">
                      <span className="text-gray-600 text-sm font-bold">Product Image</span>
                    </div>
                    <div className="flex-1 space-y-3">
                      <h2 className="text-2xl font-bold text-blue-600 hover:underline cursor-pointer">
                        {listingData.title || "Your Amazing Product Title Will Appear Here! 🚀"}
                      </h2>
                      <div className="flex items-center gap-3">
                        <div className="flex text-yellow-400 text-xl">★★★★☆</div>
                        <span className="text-sm text-gray-600 font-medium">4.2 out of 5 stars (1,234 reviews)</span>
                      </div>
                      <div className="text-3xl font-black text-red-600">$29.99</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-black text-lg">About this item</h3>
                    <ul className="space-y-2">
                      {listingData.bulletPoints
                        .filter((point) => point.trim())
                        .map((point, index) => (
                          <li
                            key={index}
                            className="text-sm font-medium p-2 bg-gray-50 rounded-lg border-2 border-gray-200"
                          >
                            • {point}
                          </li>
                        ))}
                      {listingData.bulletPoints.filter((point) => point.trim()).length === 0 && (
                        <li className="text-sm text-gray-500 font-medium p-2 bg-gray-50 rounded-lg border-2 border-gray-200">
                          • Your amazing bullet points will appear here! ✨
                        </li>
                      )}
                    </ul>
                  </div>

                  {listingData.description && (
                    <div className="space-y-3">
                      <h3 className="font-black text-lg">Product Description</h3>
                      <div className="text-sm whitespace-pre-wrap font-medium p-4 bg-gray-50 rounded-2xl border-2 border-gray-200">
                        {listingData.description}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
