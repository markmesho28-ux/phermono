// Demo catalog data intentionally left empty so the app starts clean and the admin can create entries from scratch.
export const BRANDS: string[] = [];

export const CATEGORIES: Array<{
  id: string;
  label: string;
  icon: "Sparkles" | "Wind" | "Palette" | "Droplets" | "Star";
  color: string;
  accent: string;
  subcategories: Array<{ id: string; label: string }>;
  brands?: string[];
}> = [];

export const PRODUCTS: Array<{
  id: number;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  originalPrice?: number | null;
  rating: number;
  reviews: number;
  skinType?: string | null;
  tag?: string | null;
  image: string;
  description: string;
  [key: string]: any;
}> = [];

export const PRICE_RANGES: Array<{ id: string; label: string; min?: number; max?: number }> = [];
