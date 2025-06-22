/**
 * OptimizeNav Component
 *
 * Displays a navigation bar for the Optimize section with three steps:
 * - Title
 * - Bullet Points
 * - Description
 *
 * Allows step-by-step navigation: users can only advance to the next step after completing the current one,
 * but can always go back to previous steps. Locked steps show a tooltip.
 *
 * @param {Object} props
 * @param {"title"|"bullet"|"description"} props.step - The current step
 * @param {Array<"title"|"bullet"|"description">} props.completedSteps - Steps the user has completed
 * @param {(step: "title"|"bullet"|"description") => void} props.onStepChange - Callback when a step is clicked
 */
import React from "react"

/**
 * Renders the Optimize navigation bar with three steps.
 * Allows navigation to completed or current steps; disables locked steps.
 */
interface OptimizeNavProps {
  step: "title" | "bullet" | "description"
  completedSteps: Array<"title" | "bullet" | "description">
  onStepChange: (step: "title" | "bullet" | "description") => void
}
const steps: Array<{ key: "title" | "bullet" | "description"; label: string }> = [
  { key: "title", label: "Title" },
  { key: "bullet", label: "Bullet Points" },
  { key: "description", label: "Description" },
]

function isStepAvailable(step: "title" | "bullet" | "description", completed: Array<string>) {
  // Step is available if it is completed, or if all previous steps are completed (for the next step)
  const stepIdx = steps.findIndex(s => s.key === step)
  if (completed.includes(step)) return true
  // For the first incomplete step, allow only if all previous steps are completed
  if (stepIdx === 0) return true
  const allPrevCompleted = steps.slice(0, stepIdx).every(s => completed.includes(s.key))
  return allPrevCompleted
}

const OptimizeNav: React.FC<OptimizeNavProps> = ({ step, completedSteps, onStepChange }) => {
  return (
    <nav className="w-full flex justify-center mt-4">
      <ul className="flex gap-4 bg-white/60 rounded-full px-2 py-1 shadow-md">
        {steps.map((s, idx) => {
          const isActive = step === s.key
          const isCompleted = completedSteps.includes(s.key)
          const available = isStepAvailable(s.key, completedSteps)
          return (
            <li key={s.key}>
              <button
                type="button"
                className={
                  isActive
                    ? "px-6 py-2 rounded-full font-semibold bg-gradient-to-r from-[#2C3E50] to-[#2C3E50] text-white shadow transition-all"
                    : available
                    ? "px-6 py-2 rounded-full font-semibold text-gray-700 bg-white hover:bg-[#F5B041]/20 cursor-pointer transition-all"
                    : "px-6 py-2 rounded-full font-semibold text-gray-400 bg-gray-100 cursor-not-allowed opacity-60 select-none relative group"
                }
                onClick={() => available && onStepChange(s.key)}
                disabled={!available}
                aria-current={isActive ? "step" : undefined}
                aria-disabled={!available}
              >
                {s.label}
                {!available && (
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-[-2.2rem] bg-black text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    Complete previous step to unlock
                  </span>
                )}
                {isCompleted && !isActive && (
                  <span className="ml-2 text-green-500 font-bold">✓</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default OptimizeNav 