# ListingLift.ai

> **AI-powered Amazon listing optimization SaaS.**

---

## Overview

**ListingLift.ai** is a full-stack, AI-first web application for Amazon sellers. It helps users optimize their Amazon product listings using AI, competitor analysis, and real-time suggestions. Built with Next.js (App Router), React, Tailwind CSS, Shadcn UI, and Supabase.

---

## Features

- **Modern Landing Page & Auth**: Conversion-focused landing, signup, login, and logout via Supabase.
- **Amazon Listing Optimization**: Input ASIN and "hero keyword" to fetch product and competitor data.
- **AI Suggestions**: Generate and apply AI-powered suggestions for titles, bullet points, and descriptions.
- **Competitor Analysis**: View and compare competitor listings.
- **Spellcheck**: AI-powered spellcheck for product titles and descriptions. * not implemented yet
- **Preview & Edit**: Edit, preview, and apply optimized listings.

---

## Tech Stack

- **Frontend**: Next.js (App Router), React, Tailwind CSS, Shadcn UI
- **Backend/API**: Next.js API routes, OpenAI, Decodo API, Supabase
- **Database/Auth**: Supabase
- **Other**: Radix UI, Zod, Lucide Icons, Recharts

---

## Architecture

### Frontend
- `app/page.tsx`: Main UI logic, state, and tabbed navigation (Input, Optimize, Preview)
- `app/layout.tsx`: Global layout and metadata
- `components/ui/`: Modular, reusable UI components (Card, Button, Tabs, etc.)
- `hooks/`: Custom React hooks (e.g., `use-toast`)

### Backend/API
- `app/api/decodo/route.ts`: Scrapes Amazon data via Decodo API, saves to Supabase
- `app/api/spellcheck/route.ts`: Spellchecks text using OpenAI
- `app/api/gpt-suggest/route.ts`: Generates AI suggestions for listings
- `lib/decodo.ts`: Decodo API logic and Supabase integration
- `lib/supabase.ts`: Supabase client initialization
- `lib/utils.ts`: Utility functions (e.g., Tailwind class merging)

### Data Flow
1. User authenticates (Supabase)
2. User inputs ASIN & keyword
3. App checks Supabase for cached data
4. If missing, scrapes Amazon via Decodo API
5. Competitor/product data fetched from Supabase
6. AI suggestions generated (OpenAI)
7. User edits/applies suggestions, previews listing
8. Spellcheck available via API

---

## Setup & Installation

1. **Clone the repo:**
   ```bash
   git clone https://github.com/your-org/listinglift-ai.git
   cd listinglift-ai
   ```
2. **Install dependencies:**
   ```bash
   npm install
   # or
   yarn install
   ```
3. **Configure environment variables:**
   - Copy `.env.example` to `.env.local` and fill in Supabase and OpenAI keys.
4. **Run the development server:**
   ```bash
   npm run dev
   # or
   yarn dev
   ```
5. **Build for production:**
   ```bash
   npm run build && npm start
   ```

---

## Scripts

- `dev`: Start Next.js in development mode
- `build`: Build the app for production
- `start`: Start the production server
- `lint`: Run ESLint

---

## Contributing

1. Fork the repo and create a feature branch
2. Follow the code style (functional, modular, well-commented)
3. Submit a pull request with a clear description

---

## License

MIT

---

## Acknowledgments

- [Next.js](https://nextjs.org/)
- [Supabase](https://supabase.com/)
- [OpenAI](https://openai.com/)
- [Shadcn UI](https://ui.shadcn.com/)
- [Radix UI](https://www.radix-ui.com/)
- [Decodo API](https://decodo.ai/)

---

## Contact

For questions or support, open an issue or contact the maintainers. 