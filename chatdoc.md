# ListingLift.ai Codebase Overview

## Project Purpose

**ListingLift.ai** is a full-stack, AI-powered web application for Amazon sellers. It helps users optimize their Amazon product listings using AI, competitor analysis, and real-time suggestions. The app is built with Next.js (App Router), React, Tailwind CSS, Shadcn UI, and integrates with Supabase for data storage and authentication.

---

## Key Features

- **Landing Page & Auth:**  
  - Modern, conversion-focused landing page.
  - User authentication (signup, login, logout) via Supabase.
- **Main App (Post-Login):**
  - Users input their product ASIN and a "hero keyword."
  - The app fetches product and competitor data (from Supabase or by scraping Amazon via the Decodo API).
  - AI generates suggestions to optimize the listing (title, bullets, description).
  - Users can view, edit, and apply suggestions, preview their optimized listing, and see competitor analysis.
- **AI Spellcheck:**  
  - API endpoint for spellchecking product titles using OpenAI GPT-3.5-turbo.

---

## Technical Architecture

### Frontend (Next.js, React, Tailwind, Shadcn UI)
- **`app/page.tsx`:**  
  - Main entry point and UI logic for the app.
  - Handles page state (landing, signup, login, app).
  - Auth state is managed via Supabase.
  - Main app UI is tabbed: Input, Optimize, Preview.
  - Integrates with backend APIs for scraping, spellcheck, and data storage.
  - Uses a variety of modular UI components from `components/ui/`.

- **`app/layout.tsx`:**  
  - Global layout and metadata.

- **UI Components:**  
  - Located in `components/ui/`, these are modular, reusable, and well-structured (e.g., `Card`, `Button`, `Tabs`, etc.).

- **Custom Hooks:**  
  - In `hooks/`, e.g., `use-toast` for notifications.

### Backend/API
- **API Routes (`app/api/`):**
  - **`/api/decodo/route.ts`:**  
    - Receives POST requests with scrape parameters.
    - Calls the Decodo scraper utility (server-side) to fetch Amazon product/search data.
    - Saves results to Supabase.
  - **`/api/spellcheck/route.ts`:**  
    - Receives POST requests with text.
    - Uses OpenAI to spellcheck and returns suggestions.

- **Lib Utilities (`lib/`):**
  - **`decodo.ts`:**  
    - Handles all Decodo API logic for scraping Amazon.
    - Saves product/search results to Supabase.
    - Throws errors on failure.
  - **`supabase.ts`:**  
    - Initializes the Supabase client using environment variables.
  - **`utils.ts`:**  
    - Utility for merging Tailwind class names.

---

## Data Flow

1. **User Authenticates** (via Supabase).
2. **User Inputs ASIN & Keyword**.
3. **App Checks Supabase** for existing product/competitor data.
4. **If Data Missing:**  
   - Calls `/api/decodo` to scrape Amazon via Decodo API.
   - Saves results to Supabase.
5. **Competitor Data & Product Title** are fetched from Supabase.
6. **AI Suggestions** are generated (future: could be via another API).
7. **User Edits/Applies Suggestions** and previews the optimized listing.
8. **Spellcheck** is available via `/api/spellcheck`.

---

## Design & Code Quality

- Highly modular, functional, and declarative.
- No classes or enums; uses maps and pure functions.
- All functions and files are well-commented (JSDoc style).
- UI is modern, accessible, and responsive.
- File structure is clean and navigable.
- All environment secrets are handled server-side.

---

## Summary

**ListingLift.ai** is a modern, AI-first SaaS for Amazon listing optimization. It combines:
- User authentication,
- Amazon data scraping (via Decodo),
- Competitor analysis,
- AI-powered suggestions (with OpenAI spellcheck),
- A beautiful, modular UI.

The codebase is clean, scalable, and ready for further AI-driven features.

If you want a more detailed breakdown of any specific part (e.g., API, UI, data model), see the relevant source files or ask for a deep dive! 