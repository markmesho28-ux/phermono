import React, { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import ProductCard from "./ProductCard";
import CategoryBar from "./CategoryBar";
import supabase from "../lib/supabase";
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const wishlistLookup = useMemo(() => new Set((wishlist || []).map((item) => item.id)), [wishlist]);
  const visibleProducts = useMemo(
    () => (isAdmin ? products : products.filter((product) => !product.isHidden)),
    [isAdmin, products],
  );
  const sortNewestFirst = (a: Product, b: Product) => {
    const aTime = a.createdAt ? new Date(String(a.createdAt)).getTime() : 0;
    const bTime = b.createdAt ? new Date(String(b.createdAt)).getTime() : 0;
    const aIsValid = Number.isFinite(aTime);
    const bIsValid = Number.isFinite(bTime);

    if (aIsValid && bIsValid && aTime !== bTime) {
      return bTime - aTime;
    }
    if (aIsValid !== bIsValid) {
      return aIsValid ? -1 : 1;
    }

    return Number(b.id) - Number(a.id);
  };
  const [featuredProducts, setFeaturedProducts] = useState({ bestSellers: [] as Product[], newArrivals: [] as Product[] });
  const [isFeatureLoading, setIsFeatureLoading] = useState(true);
  const hasCachedVisibleProducts = visibleProducts.length > 0;
  const hasRenderedFeaturedProducts = featuredProducts.bestSellers.length > 0 || featuredProducts.newArrivals.length > 0;
  const cachedBestSellers = useMemo(
    () => [...visibleProducts]
      .filter((product) => Boolean(product.hero) || Boolean((product as any).isBestSeller) || Boolean((product as any).is_best_seller) || String(product.tag || '').toLowerCase() === 'best seller')
      .slice(0, 8),
    [visibleProducts],
  );
  const cachedNewArrivals = useMemo(
    () => [...visibleProducts]
      .filter((product) => product.createdAt)
      .sort(sortNewestFirst)
      .slice(0, 8),
    [visibleProducts],
  );
  const featuredRequestRef = useRef<Promise<void> | null>(null);
  const featureSignatureRef = useRef<string>('');
  const emptySignatureFetchAttemptedRef = useRef(false);
  const homepageEffectIdRef = useRef(0);
  const remoteFeaturedResolvedRef = useRef(false);

  useEffect(() => {
    const effectId = ++homepageEffectIdRef.current;
    remoteFeaturedResolvedRef.current = false;
    const signature = visibleProducts
      .map((product) => `${product.id}:${product.hero}:${product.tag ?? ''}:${product.createdAt ?? ''}`)
      .join('|');
    const shouldSkipEmptySignature = signature === '' && emptySignatureFetchAttemptedRef.current;

    if ((featureSignatureRef.current === signature && featureSignatureRef.current !== '') || shouldSkipEmptySignature) {
      return;
    }
    featureSignatureRef.current = signature;
    emptySignatureFetchAttemptedRef.current = signature === '';

    const normalizeHomepageProduct = (row: any): Product => {
      const numericId = Number(row?.id);
      const id = Number.isFinite(numericId) ? numericId : Number(String(row?.id || '').slice(-6)) || Math.floor(Math.random() * 1000000);
      const brand = String(row?.brand || row?.brand_name || '').trim();
      const createdAt = row?.created_at ?? row?.createdAt ?? null;
      const sellingPrice = Number(row?.selling_price ?? row?.sellingPrice ?? 0);
      const marketPrice = Number(row?.market_price ?? row?.marketPrice ?? 0);
      const image = String(row?.image || row?.image_url || '').trim();
      const tag = String(row?.tag || '').trim();
      const hero = Boolean(row?.hero || row?.is_best_seller || row?.isBestSeller || tag.toLowerCase() === 'best seller');

      return {
        id,
        name: String(row?.name || row?.label || 'Product'),
        brand,
        category: String(row?.category_id || row?.category || ''),
        subcategory: row?.subcategory_id ?? row?.subcategory ?? null,
        subcategoryId: row?.subcategory_id ?? row?.subcategory ?? null,
        createdAt,
        originalPrice: marketPrice || null,
        sellingPrice: Number.isFinite(sellingPrice) ? sellingPrice : 0,
        marketPrice: Number.isFinite(marketPrice) ? marketPrice : null,
        stock: Number(row?.stock ?? 0),
        isHidden: Boolean(row?.is_hidden),
        rating: Number(row?.rating ?? 0),
        reviews: Number(row?.reviews ?? 0),
        tag: tag || (hero ? 'Best Seller' : null),
        hero,
        isBestSeller: hero,
        is_best_seller: hero,
        image,
        description: String(row?.description || row?.details || ''),
      };
    };

    const loadFeaturedProducts = async () => {
      if (!supabase) {
        return;
      }

      if (featuredRequestRef.current) {
        await featuredRequestRef.current;
        return;
      }

      const request = (async () => {
        try {
          const homepageSelect = 'id,name,brand,category_id,subcategory_id,tag,hero,is_best_seller,image,created_at,selling_price,market_price,stock,is_hidden,rating,reviews,description';
          const [bestSellersResult, newArrivalsResult] = await Promise.all([
            supabase
              .from('products')
              .select(homepageSelect)
              .eq('is_hidden', false)
              .or('hero.eq.true,is_best_seller.eq.true,tag.ilike.%Best%20Seller%')
              .order('created_at', { ascending: false })
              .limit(8),
            supabase
              .from('products')
              .select(homepageSelect)
              .eq('is_hidden', false)
              .order('created_at', { ascending: false })
              .limit(8),
          ]);

          if (effectId !== homepageEffectIdRef.current) return;

          const bestSellers = (bestSellersResult.data || [])
            .map(normalizeHomepageProduct)
            .filter((product) => product && (product.hero || String(product.tag || '').toLowerCase().includes('best seller')))
            .slice(0, 8);

          const newArrivals = (newArrivalsResult.data || [])
            .map(normalizeHomepageProduct)
            .filter((product) => product)
            .slice(0, 8);

          remoteFeaturedResolvedRef.current = true;
          setFeaturedProducts({
            bestSellers,
            newArrivals,
          });
          setIsFeatureLoading(false);
        } catch (error) {
          console.warn('Failed to fetch homepage product sections:', error);
          const prepareFeaturedProducts = () => {
            if (remoteFeaturedResolvedRef.current) return;
            const sortedProductsByNewest = [...visibleProducts]
              .filter((p) => p.createdAt)
              .sort(sortNewestFirst);

            const bestSellers = [...visibleProducts]
              .filter((p) => Boolean(p.hero) || Boolean((p as any).isBestSeller) || Boolean((p as any).is_best_seller) || String(p.tag || '').toLowerCase() === 'best seller')
              .slice(0, 8);

            if (effectId !== homepageEffectIdRef.current) return;
            setFeaturedProducts({
              bestSellers,
              newArrivals: sortedProductsByNewest.slice(0, 8),
            });
            setIsFeatureLoading(false);
          };

          prepareFeaturedProducts();
        }
      })();

      featuredRequestRef.current = request;

      try {
        await request;
      } finally {
        if (featuredRequestRef.current === request) {
          featuredRequestRef.current = null;
        }
      }
    };

    setIsFeatureLoading(!hasCachedVisibleProducts && !hasRenderedFeaturedProducts);

    if (!supabase) {
      const prepareFeaturedProducts = () => {
        if (remoteFeaturedResolvedRef.current) return;
        const sortedProductsByNewest = [...visibleProducts]
          .filter((p) => p.createdAt)
          .sort(sortNewestFirst);

        const bestSellers = [...visibleProducts]
          .filter((p) => Boolean(p.hero) || Boolean((p as any).isBestSeller) || Boolean((p as any).is_best_seller) || String(p.tag || '').toLowerCase() === 'best seller')
          .slice(0, 8);

        if (effectId !== homepageEffectIdRef.current) return;
        setFeaturedProducts({
          bestSellers,
          newArrivals: sortedProductsByNewest.slice(0, 8),
        });
        setIsFeatureLoading(false);
      };

      prepareFeaturedProducts();
      return undefined;
    }

    const prepareFeaturedProducts = () => {
      if (remoteFeaturedResolvedRef.current) return;
      const sortedProductsByNewest = [...visibleProducts]
        .filter((p) => p.createdAt)
        .sort(sortNewestFirst);

      const bestSellers = [...visibleProducts]
        .filter((p) => Boolean(p.hero) || Boolean((p as any).isBestSeller) || Boolean((p as any).is_best_seller) || String(p.tag || '').toLowerCase() === 'best seller')
        .slice(0, 8);

      if (effectId !== homepageEffectIdRef.current) return;
      setFeaturedProducts({
        bestSellers,
        newArrivals: sortedProductsByNewest.slice(0, 8),
      });
      setIsFeatureLoading(false);
    };

    const timeoutId = window.setTimeout(prepareFeaturedProducts, 0);
    void loadFeaturedProducts();

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [visibleProducts]);

  const renderedBestSellers = featuredProducts.bestSellers.length > 0 ? featuredProducts.bestSellers : cachedBestSellers;
  const renderedNewArrivals = featuredProducts.newArrivals.length > 0 ? featuredProducts.newArrivals : cachedNewArrivals;
  const shouldShowFeatureSkeletons = isFeatureLoading && !hasCachedVisibleProducts && !hasRenderedFeaturedProducts;

  const renderProductSkeletons = (count = 4) =>
    Array.from({ length: count }, (_, index) => (
      <div
        key={`product-skeleton-${index}`}
        className="h-[240px] animate-pulse rounded-[24px] border border-stone-200 bg-stone-200/70"
        aria-label="Loading products"
      />
    ));

  // ---------------------------------------------------------------------------
  // Stale-while-revalidate banner cache
  // Read from localStorage synchronously so the banner is visible on first paint
  // and never collapses during re-mounts / navigation.
  // ---------------------------------------------------------------------------
  const BANNER_CACHE_KEY = 'phermono_promo_banner_v1';

  const readBannerCache = (): PromoBannerConfig | null => {
    try {
      const raw = localStorage.getItem(BANNER_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Minimal guard: must have content.headline
      if (parsed && typeof parsed?.content?.headline === 'string') return parsed as PromoBannerConfig;
    } catch (_) { /* ignore */ }
    return null;
  };

  const writeBannerCache = (config: PromoBannerConfig) => {
    try { localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify(config)); } catch (_) { /* ignore */ }
  };

  const [bannerConfig, setBannerConfig] = useState<PromoBannerConfig>(() => readBannerCache() ?? DEFAULT_PROMO_BANNER);
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

  useEffect(() => {
    let isMounted = true;

    const loadBanner = async () => {
      try {
        const next = await fetchPromoBannerConfig();
        if (!isMounted || !next || !next.content || typeof next.content.headline !== 'string') {
          return;
        }
        setBannerConfig(next);
        setTextDraft(next.content.headline);
        writeBannerCache(next);
      } catch (error) {
        if (!isMounted) return;
        // Keep whatever is already shown (cache or default) — don't blank it
        console.warn('Failed to load promo banner config:', error);
      }
    };

    loadBanner();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!textEditorOpen) {
      setTextDraft(bannerConfig.content.headline);
    }
  }, [bannerConfig, textEditorOpen]);

  const saveTextValues = async () => {
    if (!bannerConfig) return;

    const nextHeadline = textDraft.trim() || bannerConfig.content.headline || DEFAULT_PROMO_BANNER.content.headline;

    if (nextHeadline.length > 80) {
      setTextError('Main message must be 80 characters or less.');
      return;
    }

    const previousBanner = bannerConfig;
    const optimisticBanner = {
      ...bannerConfig,
      content: {
        ...bannerConfig.content,
        headline: nextHeadline,
      },
    };

    setTextSaving(true);
    setTextError('');
    setBannerConfig(optimisticBanner);
    setTextDraft(nextHeadline);

    try {
      const next = await savePromoBannerContent({
        ...bannerConfig,
        content: {
          ...bannerConfig.content,
          headline: nextHeadline,
        },
      });

      const finalBanner = next && next.content.headline ? next : previousBanner;
      setBannerConfig(finalBanner);
      setTextDraft(finalBanner.content.headline);
      setTextEditorOpen(false);
      setTextError('');
    } catch (error: any) {
      console.error('saveTextValues error:', error);
      setBannerConfig(previousBanner);
      setTextDraft(previousBanner.content.headline);
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
        {imageEditorIndex !== null && isAdmin && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
            <div
              className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-brand-black">Edit Product Image</h3>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setImageEditorIndex(null);
                    setImageDraft('');
                    setImageError('');
                  }}
                  className="rounded-full bg-stone-100 p-1.5 text-stone-700"
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  <X size={14} />
                </button>
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
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setImageEditorIndex(null);
                    setImageDraft('');
                    setImageError('');
                  }}
                  className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700"
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void saveImageValue();
                  }}
                  disabled={imageSaving}
                  aria-busy={imageSaving}
                  className="rounded-full bg-brand-black px-3 py-2 text-sm font-semibold text-white"
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {textEditorOpen && isAdmin && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
            <div
              className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-brand-black">Edit Text</h3>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setTextEditorOpen(false);
                    setTextError('');
                  }}
                  className="rounded-full bg-stone-100 p-1.5 text-stone-700"
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  <X size={14} />
                </button>
              </div>
              {textError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">{textError}</div>}
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Main Headline</label>
                  <input value={textDraft} onChange={(e) => setTextDraft(e.target.value.slice(0, 80))} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-brand-black outline-none focus:border-brand-gold" />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setTextEditorOpen(false);
                    setTextError('');
                  }}
                  className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700"
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void saveTextValues();
                  }}
                  disabled={textSaving}
                  aria-busy={textSaving}
                  className="rounded-full bg-brand-black px-3 py-2 text-sm font-semibold text-white"
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Category Cards Section — placed right below header, right above Hero (Best Sellers) section */}
        <CategoryBar
          categories={categories}
          onSelect={onCategorySelect}
        />

        <section className="rounded-[30px] border border-[#d4b06d]/30 bg-[radial-gradient(circle_at_top,_rgba(43,33,25,0.98),_rgba(17,15,12,0.98)_42%,_rgba(11,10,9,1)_100%)] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.18)] md:p-6">
          <div className="mb-4 md:mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[9px] md:text-[11px] font-bold uppercase tracking-[0.26em] text-[#f3d194]">Curated favourites</p>
              <h2 className="mt-2 font-serif-luxury text-2xl text-white leading-none md:text-5xl">Best Sellers</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {shouldShowFeatureSkeletons
              ? renderProductSkeletons(4)
              : renderedBestSellers.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={onAddToCart}
                    onQuickView={onQuickView}
                    onWishlist={onWishlist}
                    isWishlisted={wishlistLookup.has(product.id)}
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
            {shouldShowFeatureSkeletons
              ? renderProductSkeletons(4)
              : renderedNewArrivals.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={onAddToCart}
                    onQuickView={onQuickView}
                    onWishlist={onWishlist}
                    isWishlisted={wishlistLookup.has(product.id)}
                    showStatusBadges={false}
                  />
                ))}
          </div>
        </section>
      </div>
    </div>
  );
}
