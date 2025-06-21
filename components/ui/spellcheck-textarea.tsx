"use client"

import * as React from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSpellcheck } from "@/hooks/use-spellcheck"
import { Sparkles, AlertCircle } from "lucide-react"

interface SpellcheckTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
  disabled?: boolean
}

/**
 * Enhanced textarea component with built-in spellcheck functionality.
 * Highlights misspelled words and provides correction suggestions.
 */
export function SpellcheckTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
  disabled = false
}: SpellcheckTextareaProps) {
  const {
    isChecking,
    errors,
    hasErrors,
    checkSpelling,
    applySuggestion,
    clearErrors
  } = useSpellcheck()

  const [showSuggestions, setShowSuggestions] = React.useState(false)
  const [isApplyingFix, setIsApplyingFix] = React.useState(false)
  const debounceTimer = React.useRef<NodeJS.Timeout | null>(null)

  /**
   * Handle spellcheck button click
   */
  const handleSpellcheck = React.useCallback(async () => {
    await checkSpelling(value)
  }, [value, checkSpelling])

  /**
   * Debounced spellcheck function
   */
  const debouncedSpellcheck = React.useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }
    
    debounceTimer.current = setTimeout(() => {
      if (value.trim()) {
        checkSpelling(value)
      }
    }, 1000) // 1 second debounce
  }, [value, checkSpelling])

  /**
   * Handle keydown events for spacebar spellcheck
   */
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === ' ' || e.code === 'Space') {
      debouncedSpellcheck()
    }
  }, [debouncedSpellcheck])

  // Auto-close suggestions when no errors remain, but never auto-open
  React.useEffect(() => {
    if (errors.length === 0) {
      setShowSuggestions(false)
    }
    // Note: We deliberately don't auto-open when errors.length > 0
    // Users must click the red icon to view suggestions
  }, [errors.length])

  // Cleanup debounce timer on unmount
  React.useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [])

  /**
   * Apply a single suggestion and re-check
   */
  const handleApplySuggestion = React.useCallback(async (errorIndex: number) => {
    const error = errors[errorIndex]
    if (error && !isApplyingFix) {
      setIsApplyingFix(true)
      
      // Immediately close suggestions popover and clear all errors
      setShowSuggestions(false)
      clearErrors()
      
      try {
        console.log("Before correction - Current text:", `"${value}"`)
        console.log("Applying error:", error)
        
        // Apply the correction using the current text value
        const correctedText = applySuggestion(value, error)
        
        console.log("After correction - New text:", `"${correctedText}"`)
        
        // Only update if the text actually changed
        if (correctedText !== value) {
          onChange(correctedText)
          
          // Run full spellcheck on the corrected text
          await checkSpelling(correctedText)
        } else {
          console.warn("Correction did not change text - likely an error occurred")
        }
      } catch (err) {
        console.error("Error applying suggestion:", err)
      } finally {
        setIsApplyingFix(false)
      }
    }
  }, [errors, value, applySuggestion, onChange, checkSpelling, clearErrors, isApplyingFix])



  /**
   * Handle text change
   */
  const handleTextChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    // Clear errors when text changes significantly
    if (Math.abs(newValue.length - value.length) > 5) {
      clearErrors()
    }
  }, [onChange, value.length, clearErrors])

  return (
    <div className="relative">
      <div className="relative">
        <Textarea
          value={value}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          className={`${className} ${hasErrors ? 'pr-12' : ''}`}
          disabled={disabled}
        />
        
        {/* Spellcheck button */}
        <div className="absolute top-2 right-2 flex gap-1">
          {hasErrors && (
            <Popover open={showSuggestions} onOpenChange={setShowSuggestions}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 w-6 p-0 border-red-400 text-red-600"
                  onClick={() => setShowSuggestions(true)}
                  disabled={isApplyingFix}
                >
                  {isApplyingFix ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-red-600"></div>
                  ) : (
                    <AlertCircle className="h-3 w-3" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4">
                                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm">Spelling Suggestions</h4>
                      <div className="flex items-center gap-2">
                        {isApplyingFix && (
                          <div className="flex items-center gap-1 text-xs text-blue-600">
                            <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600"></div>
                            Updating...
                          </div>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {errors.length > 1 ? `1 of ${errors.length} errors` : `${errors.length} error${errors.length !== 1 ? 's' : ''}`}
                        </Badge>
                      </div>
                    </div>
                  
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {isApplyingFix && (
                      <div className="text-center py-2 text-xs text-blue-600 bg-blue-50 rounded border">
                        Applying fix and recalculating suggestions...
                      </div>
                    )}
                    {errors.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex-1 min-w-0">
                            <span className="line-through text-red-600 text-sm">{errors[0].word}</span>
                            <span className="mx-2">→</span>
                            <span className="text-green-600 font-medium text-sm">{errors[0].suggestion}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs ml-2 flex-shrink-0"
                            onClick={() => handleApplySuggestion(0)}
                            disabled={isApplyingFix}
                          >
                            {isApplyingFix ? (
                              <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-600"></div>
                            ) : (
                              "Apply"
                            )}
                          </Button>
                        </div>
                        {errors.length > 1 && (
                          <div className="text-xs text-gray-500 text-center py-1">
                            {errors.length - 1} more error{errors.length - 1 !== 1 ? 's' : ''} will appear after fixing this one
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowSuggestions(false)}
                      className="w-full"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
          
          <Button
            size="sm"
            variant="outline"
            className="h-6 w-6 p-0"
            onClick={handleSpellcheck}
            disabled={isChecking || disabled || !value.trim()}
          >
            {isChecking ? (
              <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-600" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
} 