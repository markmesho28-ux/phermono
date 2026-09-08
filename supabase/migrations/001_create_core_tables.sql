-- Migration: create core tables for PherMono
-- Run this in the Supabase SQL editor or via psql connected to your Supabase database.

-- products table
CREATE TABLE IF NOT EXISTS products (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  price NUMERIC NOT NULL,
  original_price NUMERIC,
  selling_price NUMERIC,
  market_price NUMERIC,
  admin_cost NUMERIC,
  rating NUMERIC DEFAULT 0,
  reviews INTEGER DEFAULT 0,
  skin_type TEXT,
  tag TEXT,
  hero BOOLEAN DEFAULT FALSE,
  image TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- orders table
CREATE TABLE IF NOT EXISTS orders (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  governorate TEXT,
  address TEXT,
  items JSONB NOT NULL,
  total NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- categories table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  accent TEXT,
  subcategories JSONB DEFAULT '[]'::jsonb,
  brands TEXT[] DEFAULT ARRAY[]::text[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- guest chat usage table
CREATE TABLE IF NOT EXISTS guest_chat_usage (
  fingerprint TEXT NOT NULL,
  date DATE NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (fingerprint, date)
);

-- user chat usage table
CREATE TABLE IF NOT EXISTS user_chat_usage (
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_categories_label ON categories(label);

-- Functions/triggers to keep updated_at fresh
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
