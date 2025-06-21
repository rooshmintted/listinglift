"use client"

import * as React from "react"

/**
 * Interface for spelling error data returned by the API
 */
interface SpellingError {
  word: string
  start: number
  end: number
  suggestion: string
}

/**
 * Spellcheck hook for managing spelling errors and corrections in text fields.
 * Uses the existing /api/spellcheck endpoint.
 */
export function useSpellcheck() {
  const [isChecking, setIsChecking] = React.useState(false)
  const [errors, setErrors] = React.useState<SpellingError[]>([])
  const [lastCheckedText, setLastCheckedText] = React.useState("")

  /**
   * Check text for spelling errors using the API
   */
  const checkSpelling = React.useCallback(async (text: string) => {
    if (!text.trim()) {
      setErrors([])
      setLastCheckedText("")
      return
    }

    setIsChecking(true)
    try {
      const response = await fetch("/api/spellcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      })
      
      if (response.ok) {
        const spellingErrors: SpellingError[] = await response.json()
        setErrors(spellingErrors)
        setLastCheckedText(text)
      } else {
        console.error("Spellcheck failed:", response.statusText)
        setErrors([])
      }
    } catch (error) {
      console.error("Spellcheck error:", error)
      setErrors([])
    } finally {
      setIsChecking(false)
    }
  }, [])

  /**
   * Apply a single spelling correction to text with robust word matching
   */
  const applySuggestion = React.useCallback((text: string, error: SpellingError): string => {
    // First try exact match at the given indices
    if (error.start >= 0 && error.end <= text.length && error.start < error.end) {
      const actualWord = text.substring(error.start, error.end)
      if (actualWord === error.word) {
        // Perfect match - apply directly
        const before = text.substring(0, error.start)
        const after = text.substring(error.end)
        return before + error.suggestion + after
      }
    }
    
    // If exact match fails, search for the word in the nearby area
    const searchWindow = 10 // Search 10 characters before and after the expected position
    const searchStart = Math.max(0, error.start - searchWindow)
    const searchEnd = Math.min(text.length, error.end + searchWindow)
    const searchArea = text.substring(searchStart, searchEnd)
    
    // Look for the exact word in the search area
    const wordIndex = searchArea.indexOf(error.word)
    if (wordIndex !== -1) {
      // Found the word in the nearby area
      const actualStart = searchStart + wordIndex
      const actualEnd = actualStart + error.word.length
      
      console.log("Found word via search:", {
        original: error.word,
        suggestion: error.suggestion,
        expectedIndices: `${error.start}-${error.end}`,
        actualIndices: `${actualStart}-${actualEnd}`,
        searchArea: `"${searchArea}"`
      })
      
      const before = text.substring(0, actualStart)
      const after = text.substring(actualEnd)
      return before + error.suggestion + after
    }
    
    // If still no match, try a more flexible approach
    // Look for partial matches or word boundaries
    const words = text.split(/(\s+)/) // Split but keep separators
    for (let i = 0; i < words.length; i++) {
      const word = words[i].trim()
      if (word === error.word) {
        // Found exact word match
        words[i] = words[i].replace(error.word, error.suggestion)
        console.log("Found word via split-search:", {
          original: error.word,
          suggestion: error.suggestion,
          wordIndex: i
        })
        return words.join('')
      }
    }
    
    console.warn("Could not find word to replace:", {
      word: error.word,
      suggestion: error.suggestion,
      text: `"${text}"`,
      indices: `${error.start}-${error.end}`,
      actualAtIndices: `"${text.substring(error.start, error.end)}"`
    })
    
    return text // Return unchanged if we can't safely apply the correction
  }, [])





  /**
   * Clear all spelling errors
   */
  const clearErrors = React.useCallback(() => {
    setErrors([])
    setLastCheckedText("")
  }, [])

  return {
    isChecking,
    errors,
    hasErrors: errors.length > 0,
    lastCheckedText,
    checkSpelling,
    applySuggestion,
    clearErrors
  }
} 