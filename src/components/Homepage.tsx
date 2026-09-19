import React, { useEffect, useState } from "react";
import { Edit2, X } from "lucide-react";
import ProductCard from "./ProductCard";
import CategoryBar from "./CategoryBar";
import { useData } from "../contexts/DataContext";
import { useAuth } from "../contexts/AuthContext";
import type { Product } from "../types";
import {
  DEFAULT_PROMO_BANNER,
  MIDDLE_PROMO_BANNER_PRODUCT_ID,
  fetchPromoBannerConfig,
  savePromoBannerContent,
  savePromoBannerProductImage,
  type PromoBannerConfig,
} from "../utils/promoBanner";

interface HomepageProps {
  onAddToCart: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onWishlist: (product: Product) => void;
  wishlist: Product[];
  onCategorySelect?: (id: string) => void;
  onBrandSelect?: (brand: string) => void;
}

export default function Homepage({
  onAddToCart,
  onQuickView,
  onWishlist,
  wishlist,
  onCategorySelect,
}: HomepageProps) {
  const { products, categories } = useData();

  // New arrivals: strictly by creation date (most recent first). Only include rows that have a valid `createdAt`.
  const sortedProductsByNewest = [...products]
    .filter((p) => p.createdAt)
    .sort((a, b) => Number(new Date(String((b as any).createdAt))) - Number(new Date(String((a as any).createdAt))));
  const newArrivals = sortedProductsByNewest.slice(0, 8);

  // Best sellers: strictly products explicitly flagged by admin. Do NOT fallback to random products.
  const bestSellers = [...products]
    .filter((p) => Boolean(p.hero) || String(p.tag || '').toLowerCase() === 'best seller')
    .slice(0, 8);

  const renderedBestSellers = bestSellers; // intentionally no fallback
  const renderedNewArrivals = newArrivals; // intentionally no fallback

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [bannerConfig, setBannerConfig] = useState<PromoBannerConfig | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [textEditorOpen, setTextEditorOpen] = useState(false);
  const [imageEditorIndex, setImageEditorIndex] = useState<number | null>(null);
  // Keep the exact promotional_banner_products.id for the image being edited to avoid index races
  const [imageEditorProductId, setImageEditorProductId] = useState<string | null>(null);
  const [imageDraft, setImageDraft] = useState('');
  const [imageError, setImageError] = useState('');
  const [textError, setTextError] = useState('');
  const [textSaving, setTextSaving] = useState(false);
  const [imageSaving, setImageSaving] = useState(false);
  const [bannerLoading, setBannerLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadBanner = async () => {
      setBannerLoading(true);
      try {
        const next = await fetchPromoBannerConfig();
        if (!isMounted) return;
        setBannerConfig(next);
        setTextDraft(next.content.headline);
      } catch (error) {
        if (!isMounted) return;
        setBannerConfig(null);
        setTextDraft('');
        console.warn('Failed to load promo banner config:', error);
      } finally {
        if (isMounted) {
          setBannerLoading(false);
        }
      }
    };

    loadBanner();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (bannerConfig) {
      setTextDraft(bannerConfig.content.headline);
    }
  }, [bannerConfig]);

  const saveTextValues = async () => {
    if (!bannerConfig) return;

    const nextHeadline = textDraft.trim() || bannerConfig.content.headline || DEFAULT_PROMO_BANNER.content.headline;

    if (nextHeadline.length > 80) {
      setTextError('Main message must be 80 characters or less.');
      return;
    }

    setTextSaving(true);
    setTextError('');
    try {
      const next = await savePromoBannerContent({
        ...bannerConfig,
        content: {
          ...bannerConfig.content,
          headline: nextHeadline,
        },
      });

      setBannerConfig(next);
      setTextDraft(next.content.headline);
      setTextEditorOpen(false);
      setTextError('');

      fetchPromoBannerConfig().then((refreshed) => {
        setBannerConfig(refreshed);
        setTextDraft(refreshed.content.headline);
      }).catch((bgErr) => {
        console.warn('Background refresh failed after saving promo text:', bgErr);
      });
    } catch (error: any) {
      console.error('saveTextValues error:', error);
      setTextError(error?.message || 'Failed to save banner text.');
    } finally {
      setTextSaving(false);
    }
  };

  const handleImageUpload = (file: File | null) => {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setImageError('Unsupported file type. Use PNG, JPG, JPEG, or WEBP.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDraft(String(reader.result || ''));
      setImageError('');
    };
    reader.readAsDataURL(file);
  };

  const saveImageValue = async () => {
    if (imageEditorIndex === null || !bannerConfig) return;

    setImageSaving(true);
    setImageError('');
    try {
      // Prefer using the stored product id to avoid index races
      const productFromIndex = bannerConfig.products[imageEditorIndex];
      const positionToUse = imageEditorIndex + 1;
      const productIdToUse = imageEditorIndex === 1
        ? (imageEditorProductId || productFromIndex?.id || MIDDLE_PROMO_BANNER_PRODUCT_ID)
        : (imageEditorProductId ?? productFromIndex?.id);

      const saveStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const next = await savePromoBannerProductImage({
        bannerId: bannerConfig.bannerId,
        productId: productIdToUse ?? undefined,
        position: positionToUse,
        fileDataUrl: imageDraft || null,
        alt: productFromIndex?.alt || `Promotional product ${positionToUse}`,
      });

      if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
        const saveMs = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - saveStartedAt);
        console.debug('[Homepage] image save completed', { saveMs, position: positionToUse, bannerId: bannerConfig.bannerId });
      }

      // Apply returned banner state immediately so UI updates without a hard refresh
      setBannerConfig(next);
      setImageEditorIndex(null);
      setImageEditorProductId(null);
      setImageDraft('');
      setImageError('');

    } catch (error: any) {
      console.error('saveImageValue error:', error);
      setImageError(error?.message || 'Failed to save the product image.');
    } finally {
      setImageSaving(false);
    };  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 pt-4 pb-20 md:pb-8 animate-fadeIn select-none">
      <div className="space-y-8 md:space-y-10">
        {!bannerLoading && bannerConfig && (
          <div className="relative isolate w-full overflow-hidden rounded-2xl border border-brand-gold/30 bg-[#f5efe7] shadow-[0_16px_36px_rgba(60,47,27,0.08)]">
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(circle at 30% 55%, rgba(217,182,118,0.18), rgba(245,239,231,0) 32%), linear-gradient(90deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 100%)',
              }}
            />

            <div className="promo-banner-shell relative z-10 w-full overflow-hidden rounded-[18px] text-brand-black">
              <div className="promo-banner-bg-sketches" aria-hidden="true">
              <svg viewBox="0 0 100 100" className="promo-banner-bg-sketch promo-banner-bg-sketch--perfume promo-banner-bg-sketch--a">
                <path d="M30 24h26v10H30zm4 10h18v28c0 8-6 14-14 14s-14-6-14-14V34z" fill="rgba(160,128,94,0.06)" stroke="rgba(26,23,21,0.42)" strokeWidth="1.4" />
                <path d="M40 16h12v10H40zm-2 40c5 5 10 7 17 10" stroke="rgba(26,23,21,0.38)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                <path d="M28 72h30" stroke="rgba(161,121,92,0.32)" strokeWidth="1.2" strokeLinecap="round" />
              </svg>

              <svg viewBox="0 0 90 90" className="promo-banner-bg-sketch promo-banner-bg-sketch--lipstick promo-banner-bg-sketch--b">
                <path d="M22 18h22l8 14v28c0 9-7 16-16 16H30c-9 0-16-7-16-16V32l8-14z" fill="rgba(205,145,126,0.06)" stroke="rgba(26,23,21,0.42)" strokeWidth="1.4" />
                <path d="M28 12h18v10H28z" fill="rgba(207,180,123,0.18)" />
                <path d="M34 30v32" stroke="rgba(26,23,21,0.38)" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M30 48c5 4 9 7 12 14" stroke="rgba(188,137,110,0.32)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              </svg>

              <svg viewBox="0 0 120 90" className="promo-banner-bg-sketch promo-banner-bg-sketch--brush promo-banner-bg-sketch--c">
                <path d="M18 60c10-16 25-26 42-34 7-4 15-7 23-14 8-6 21-4 27 4 5 7 3 17-2 24-8 12-17 17-28 24-10 6-16 14-26 25H26c-3-9-5-18-8-29z" fill="rgba(255,255,255,0.04)" stroke="rgba(26,23,21,0.38)" strokeWidth="1.3" />
                <path d="M50 15c8 5 18 12 27 22" stroke="rgba(188,160,96,0.28)" strokeWidth="1.3" strokeLinecap="round" fill="none" />
                <path d="M28 60h48" stroke="rgba(26,23,21,0.38)" strokeWidth="1.3" strokeLinecap="round" />
              </svg>

              <svg viewBox="0 0 90 90" className="promo-banner-bg-sketch promo-banner-bg-sketch--tube promo-banner-bg-sketch--d">
                <path d="M28 16h18v16H28zm-6 16h30v24c0 10-8 18-18 18S22 66 22 56V32z" fill="rgba(255,255,255,0.06)" stroke="rgba(26,23,21,0.42)" strokeWidth="1.4" />
                <path d="M36 26v36" stroke="rgba(26,23,21,0.38)" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M24 54c7 5 13 8 17 13" stroke="rgba(176,125,100,0.3)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              </svg>

              <svg viewBox="0 0 100 100" className="promo-banner-bg-sketch promo-banner-bg-sketch--jar promo-banner-bg-sketch--e">
                <path d="M28 28h28v20c0 14-9 24-20 24S28 62 28 48V28z" fill="rgba(255,255,255,0.04)" stroke="rgba(26,23,21,0.42)" strokeWidth="1.3" />
                <path d="M32 20h20v12H32z" fill="rgba(207,180,123,0.14)" />
                <path d="M32 54c10 6 18 8 24 12" stroke="rgba(26,23,21,0.34)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
              </svg>

              <svg viewBox="0 0 90 90" className="promo-banner-bg-sketch promo-banner-bg-sketch--compact promo-banner-bg-sketch--f">
                <rect x="18" y="24" width="42" height="30" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(26,23,21,0.42)" strokeWidth="1.3" />
                <path d="M28 22h22" stroke="rgba(26,23,21,0.38)" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M39 36v13" stroke="rgba(26,23,21,0.38)" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M33 42h12" stroke="rgba(205,145,126,0.3)" strokeWidth="1.1" strokeLinecap="round" />
              </svg>

              <svg viewBox="0 0 110 100" className="promo-banner-bg-sketch promo-banner-bg-sketch--brush promo-banner-bg-sketch--g">
                <path d="M15 65c9-18 25-27 41-34 8-4 17-8 26-17 7-7 19-7 25 1 5 8 3 18-2 25-9 13-20 19-31 26-11 8-17 15-26 27H23c-2-8-5-17-8-28z" fill="rgba(255,255,255,0.03)" stroke="rgba(26,23,21,0.35)" strokeWidth="1.2" />
                <path d="M42 18c7 5 17 12 26 22" stroke="rgba(188,160,96,0.26)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              </svg>

              <svg viewBox="0 0 84 84" className="promo-banner-bg-sketch promo-banner-bg-sketch--jar promo-banner-bg-sketch--h">
                <path d="M26 22h24v16c0 14-8 25-18 25S26 52 26 38V22z" fill="rgba(255,255,255,0.03)" stroke="rgba(26,23,21,0.35)" strokeWidth="1.2" />
                <path d="M30 16h18v9H30z" fill="rgba(207,180,123,0.14)" />
                <path d="M30 48c8 5 13 7 18 11" stroke="rgba(26,23,21,0.32)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
              </svg>

              <svg viewBox="0 0 96 100" className="promo-banner-bg-sketch promo-banner-bg-sketch--tube promo-banner-bg-sketch--i">
                <path d="M30 20h18v12H30zm-8 12h34v26c0 13-9 22-20 22S22 71 22 58V32z" fill="rgba(255,255,255,0.03)" stroke="rgba(26,23,21,0.35)" strokeWidth="1.2" />
                <path d="M38 26v34" stroke="rgba(26,23,21,0.32)" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M28 58c7 5 12 8 15 12" stroke="rgba(176,125,100,0.26)" strokeWidth="1.1" strokeLinecap="round" fill="none" />
              </svg>

              <svg viewBox="0 0 88 90" className="promo-banner-bg-sketch promo-banner-bg-sketch--compact promo-banner-bg-sketch--j">
                <rect x="16" y="26" width="42" height="30" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(26,23,21,0.35)" strokeWidth="1.2" />
                <path d="M26 22h22" stroke="rgba(26,23,21,0.32)" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M36 36v13" stroke="rgba(26,23,21,0.32)" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M31 42h12" stroke="rgba(205,145,126,0.26)" strokeWidth="1.1" strokeLinecap="round" />
              </svg>

              <svg viewBox="0 0 98 90" className="promo-banner-bg-sketch promo-banner-bg-sketch--perfume promo-banner-bg-sketch--k">
                <path d="M30 22h24v10H30zm4 10h16v26c0 8-6 14-14 14s-14-6-14-14V32z" fill="rgba(160,128,94,0.05)" stroke="rgba(26,23,21,0.35)" strokeWidth="1.2" />
                <path d="M42 14h10v11H42zm-4 34c6 5 11 7 16 11" stroke="rgba(26,23,21,0.3)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
              </svg>

              <svg viewBox="0 0 92 90" className="promo-banner-bg-sketch promo-banner-bg-sketch--lipstick promo-banner-bg-sketch--l">
                <path d="M22 16h20l8 12v26c0 9-7 16-16 16H30c-9 0-16-7-16-16V28l8-12z" fill="rgba(205,145,126,0.05)" stroke="rgba(26,23,21,0.35)" strokeWidth="1.2" />
                <path d="M28 12h16v8H28z" fill="rgba(207,180,123,0.14)" />
                <path d="M33 28v30" stroke="rgba(26,23,21,0.3)" strokeWidth="1.1" strokeLinecap="round" />
              </svg>

              <svg viewBox="0 0 86 86" className="promo-banner-bg-sketch promo-banner-bg-sketch--jar promo-banner-bg-sketch--m">
                <path d="M24 24h24v18c0 12-8 21-17 21S24 54 24 42V24z" fill="rgba(255,255,255,0.03)" stroke="rgba(26,23,21,0.35)" strokeWidth="1.2" />
                <path d="M28 14h18v10H28z" fill="rgba(207,180,123,0.12)" />
                <path d="M29 49c9 5 15 7 19 10" stroke="rgba(26,23,21,0.3)" strokeWidth="1.1" fill="none" strokeLinecap="round" />
              </svg>

              <svg viewBox="0 0 100 90" className="promo-banner-bg-sketch promo-banner-bg-sketch--brush promo-banner-bg-sketch--n">
                <path d="M18 58c10-16 25-26 41-33 9-4 17-8 25-16 8-7 20-5 26 4 5 9 2 18-4 24-8 10-17 15-28 22-10 7-16 15-27 26H27c-2-9-4-17-9-27z" fill="rgba(255,255,255,0.03)" stroke="rgba(26,23,21,0.35)" strokeWidth="1.2" />
                <path d="M45 12c7 5 16 12 25 21" stroke="rgba(188,160,96,0.24)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              </svg>
            </div>

              <div className="promo-banner-inner">
                <div className="promo-banner-copy-group">
                  <div className="promo-banner-text-group">
                    <p className="promo-banner-headline">{bannerConfig.content.headline}</p>
                  </div>

                  <button
                    type="button"
                    className="promo-banner-cta"
                    onClick={() => {
                      const section = document.getElementById('our-departments');
                      if (!section) return;

                      const headerHeight = Number.parseFloat(
                        getComputedStyle(document.documentElement).getPropertyValue('--header-height') || '0'
                      ) || 0;
                      const top = section.getBoundingClientRect().top + window.scrollY - headerHeight - 8;

                      window.scrollTo({
                        top: Math.max(0, top),
                        behavior: 'smooth',
                      });
                    }}
                  >
                    SHOP NOW
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      aria-label="Edit promotional text"
                      onClick={() => {
                        setTextDraft(bannerConfig.content.headline);
                        setTextEditorOpen(true);
                      }}
                      className="promo-banner-edit"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <Edit2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {imageEditorIndex !== null && isAdmin && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
            <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-brand-black">Edit Product Image</h3>
                <button type="button" onClick={() => { setImageEditorIndex(null); setImageDraft(''); setImageError(''); }} className="rounded-full bg-stone-100 p-1.5 text-stone-700"><X size={14} /></button>
              </div>
              {imageError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">{imageError}</div>}
              <div className="mb-3 flex h-24 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
                {(() => {
                  const bannerProducts = bannerConfig?.products ?? DEFAULT_PROMO_BANNER.products;
                  const currentProduct = bannerProducts.find((p) => p.id === imageEditorProductId) || bannerProducts[imageEditorIndex ?? -1] || null;
                  const previewSrc = imageDraft || currentProduct?.image;
                  return previewSrc ? (
                    <img src={previewSrc} alt="banner product preview" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] uppercase tracking-[0.2em] text-stone-400">No image</span>
                  );
                })()}
              </div>
              <label className="mb-4 inline-flex cursor-pointer items-center justify-center rounded-full bg-brand-black px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                Change Image
                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={(e) => handleImageUpload(e.target.files?.[0] || null)} />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setImageEditorIndex(null); setImageDraft(''); setImageError(''); }} className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">Cancel</button>
                <button type="button" onClick={saveImageValue} disabled={imageSaving} aria-busy={imageSaving} className="rounded-full bg-brand-black px-3 py-2 text-sm font-semibold text-white">Save</button>
              </div>
            </div>
          </div>
        )}

        {textEditorOpen && isAdmin && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-brand-black">Edit Text</h3>
                <button type="button" onClick={() => { setTextEditorOpen(false); setTextError(''); }} className="rounded-full bg-stone-100 p-1.5 text-stone-700"><X size={14} /></button>
              </div>
              {textError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">{textError}</div>}
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Main Headline</label>
                  <input value={textDraft} onChange={(e) => setTextDraft(e.target.value.slice(0, 80))} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-brand-black outline-none focus:border-brand-gold" />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => { setTextEditorOpen(false); setTextError(''); }} className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">Cancel</button>
                <button type="button" onClick={saveTextValues} disabled={textSaving} aria-busy={textSaving} className="rounded-full bg-brand-black px-3 py-2 text-sm font-semibold text-white">Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Category Cards Section — placed right below header, right above Hero (Best Sellers) section */}
        <CategoryBar
          categories={categories}
          onSelect={onCategorySelect}
        />

        <section className="rounded-[28px] border border-brand-gold/20 bg-gradient-to-b from-brand-black via-brand-charcoal to-brand-stone p-4 md:p-6 shadow-2xl">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.28em] text-brand-gold/90">Curated favourites</p>
              <h2 className="mt-2 font-serif-luxury text-3xl md:text-5xl text-white leading-none">Best Sellers</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
            {renderedBestSellers.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={onAddToCart}
                onQuickView={onQuickView}
                onWishlist={onWishlist}
                isWishlisted={wishlist.some((w) => w.id === product.id)}
                showStatusBadges={false}
              />
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-brand-gold/20 bg-[#f7f3ed] p-4 md:p-6 shadow-luxury">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.28em] text-brand-gold-dark">Fresh arrivals</p>
              <h2 className="mt-2 font-serif-luxury text-3xl md:text-5xl text-brand-black leading-none">New Arrivals</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
            {renderedNewArrivals.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={onAddToCart}
                onQuickView={onQuickView}
                onWishlist={onWishlist}
                isWishlisted={wishlist.some((w) => w.id === product.id)}
                showStatusBadges={false}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
