const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://optlbyqsxeudyiybwygo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wdGxieXFzeGV1ZHlpeWJ3eWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4Nzk4NzEsImV4cCI6MjEwNDQ1NTg3MX0.ytT4ZHYKsjD_bBL1YeBzyTG4fF1smBfK--IIzr6RHf8';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const slugify = (value) => {
  const base = String(value || '').trim();
  if (!base) return `item-${Date.now()}`;
  const normalized = base.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
  return normalized || `item-${Date.now()}`;
};

function mapSubcategoryRow(row){
  return { id: row?.id ?? row?.slug ?? String(row?.name || 'subcategory'), label: row?.name ?? row?.label ?? row?.slug ?? '' };
}

function mapCategoryRow(row, subcategoryRows = [], brandRows = []){
  return {
    id: row?.id ?? row?.slug ?? String(row?.name || 'category'),
    label: row?.name ?? row?.label ?? row?.slug ?? '',
    icon: row?.icon ?? 'Sparkles',
    color: row?.color ?? '',
    accent: row?.accent ?? '',
    subcategories: (subcategoryRows || []).filter((sub)=> sub?.category_id === row?.id).map((sub)=>({ id: sub?.id ?? sub?.slug ?? String(sub?.name || 'subcategory'), label: sub?.name ?? sub?.label ?? sub?.slug ?? '' })),
    brands: (brandRows || []).filter((brand)=> brand?.category_id === row?.id || (!brand?.category_id && row?.id)).map((brand)=> String(brand?.name ?? brand?.label ?? brand?.slug ?? '')).filter(Boolean)
  };
}

(async () => {
  try{
    const [{ data: productsData }, { data: ordersData }, { data: categoriesData }, { data: subcategoriesData }, { data: brandsData }] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('orders').select('*'),
      supabase.from('categories').select('*'),
      supabase.from('subcategories').select('*'),
      supabase.from('brands').select('*')
    ]);

    const normalizedSub = Array.isArray(subcategoriesData) ? subcategoriesData.map(mapSubcategoryRow) : [];
    const nextCategories = Array.isArray(categoriesData) ? categoriesData.map((row)=> mapCategoryRow(row, subcategoriesData || [], brandsData || [])) : [];

    const cat = nextCategories.find(c=> c.id === '5a2ce4a4-b014-45f3-aeaa-b4a6659b826d');
    console.log('Replicated fetch - category found:', !!cat);
    if(cat){
      console.log('Subcategories for category:', cat.subcategories.map(s=> ({ id: s.id, label: s.label })).slice(0,50));
    }
  } catch(e){ console.error(e); }
})();
