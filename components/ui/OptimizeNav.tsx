/**
 * OptimizeNav Component
 *
 * Displays a navigation bar for the Optimize section with three unclickable elements:
 * - Title (active/selected)
 * - Bullet Points (disabled)
 * - Description (disabled)
 *
 * This component is purely presentational and matches the current colorful, rounded theme.
 * Only the 'Title' tab is visually active; others are faded and unclickable.
 *
 * Usage: Place directly under the Optimize button/section.
 */
import React from "react"

/**
 * Renders the Optimize navigation bar with three steps.
 * All steps are unclickable; only the selected tab is active.
 */
interface OptimizeNavProps {
  selected?: "Title" | "Bullet Points" | "Description"
}
const OptimizeNav: React.FC<OptimizeNavProps> = ({ selected = "Title" }) => {
  return (
    <nav className="w-full flex justify-center mt-4">
      <ul className="flex gap-4 bg-white/60 rounded-full px-2 py-1 shadow-md">
        <li>
          <span
            className={
              selected === "Title"
                ? "px-6 py-2 rounded-full font-semibold bg-gradient-to-r from-orange-400 to-pink-500 text-white shadow transition-all"
                : "px-6 py-2 rounded-full font-semibold text-gray-400 bg-gray-100 cursor-not-allowed opacity-60 select-none"
            }
          >
            Title
          </span>
        </li>
        <li>
          <span
            className={
              selected === "Bullet Points"
                ? "px-6 py-2 rounded-full font-semibold bg-gradient-to-r from-orange-400 to-pink-500 text-white shadow transition-all"
                : "px-6 py-2 rounded-full font-semibold text-gray-400 bg-gray-100 cursor-not-allowed opacity-60 select-none"
            }
            aria-disabled={selected !== "Bullet Points"}
          >
            Bullet Points
          </span>
        </li>
        <li>
          <span
            className={
              selected === "Description"
                ? "px-6 py-2 rounded-full font-semibold bg-gradient-to-r from-orange-400 to-pink-500 text-white shadow transition-all"
                : "px-6 py-2 rounded-full font-semibold text-gray-400 bg-gray-100 cursor-not-allowed opacity-60 select-none"
            }
            aria-disabled={selected !== "Description"}
          >
            Description
          </span>
        </li>
      </ul>
    </nav>
  )
}

export default OptimizeNav 