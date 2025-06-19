-- Supabase schema for Decodo product and search results caching
--
-- Table: products
-- Stores product-level data from Decodo API

CREATE TABLE IF NOT EXISTS products (
  asin TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  reviews_count INTEGER,
  rating REAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: search_results
-- Stores organic search results for hero keywords

CREATE TABLE IF NOT EXISTS search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_keyword TEXT NOT NULL,
  asin TEXT NOT NULL,
  title TEXT NOT NULL,
  reviews_count INTEGER,
  rating REAL,
  position INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup by hero_keyword
CREATE INDEX IF NOT EXISTS idx_search_results_hero_keyword ON search_results(hero_keyword);

-- Optional: Composite unique index to prevent duplicate hero_keyword+asin+position
CREATE UNIQUE INDEX IF NOT EXISTS uniq_search_results_keyword_asin_pos ON search_results(hero_keyword, asin, position); 