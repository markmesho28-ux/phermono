import React, { useEffect, useMemo, useState } from "react";
import { Edit2, Trash2, X } from "lucide-react";
import ProductCard from "./ProductCard";
import CategoryBar from "./CategoryBar";
import { useData } from "../contexts/DataContext";
import { useAuth } from "../contexts/AuthContext";
import type { Product } from "../types";
import {
  DEFAULT_PROMO_BANNER,
  deletePromoBannerProductImage,
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
  const [bannerConfig, setBannerConfig] = useState<PromoBannerConfig>(DEFAULT_PROMO_BANNER);
  const [textDraft, setTextDraft] = useState(DEFAULT_PROMO_BANNER.content);
  const [textEditorOpen, setTextEditorOpen] = useState(false);
  const [imageEditorIndex, setImageEditorIndex] = useState<number | null>(null);
  const [imageDraft, setImageDraft] = useState('');
  const [imageError, setImageError] = useState('');
  const [textError, setTextError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadBanner = async () => {
      const next = await fetchPromoBannerConfig();
      if (!isMounted) return;
      setBannerConfig(next);
      setTextDraft(next.content);
    };

    loadBanner();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setTextDraft(bannerConfig.content);
  }, [bannerConfig]);

  const productSlots = useMemo(() => [
    { className: 'absolute left-[6%] bottom-[4px] h-[62px] w-[52px] -rotate-[12deg]', sizeClass: 'object-cover' },
    { className: 'absolute left-[29%] bottom-[6px] h-[68px] w-[52px] rotate-[8deg]', sizeClass: 'object-cover' },
    { className: 'absolute right-[10%] bottom-[2px] h-[72px] w-[56px] -rotate-[10deg]', sizeClass: 'object-cover' },
  ], []);

  const saveTextValues = async () => {
    const nextCampaign = textDraft.campaignLabel.trim() || DEFAULT_PROMO_BANNER.content.campaignLabel;
    const nextHeadline = textDraft.headline.trim() || DEFAULT_PROMO_BANNER.content.headline;
    const nextBadge = textDraft.badge.trim() || DEFAULT_PROMO_BANNER.content.badge;

    if (nextCampaign.length > 30) {
      setTextError('Campaign label must be 30 characters or less.');
      return;
    }
    if (nextHeadline.length > 80) {
      setTextError('Main message must be 80 characters or less.');
      return;
    }
    if (nextBadge.length > 25) {
      setTextError('Badge must be 25 characters or less.');
      return;
    }

    try {
      const next = await savePromoBannerContent({
        ...bannerConfig,
        content: {
          campaignLabel: nextCampaign,
          headline: nextHeadline,
          badge: nextBadge,
        },
      });
      setBannerConfig(next);
      setTextEditorOpen(false);
      setTextError('');
    } catch (error: any) {
      setTextError(error?.message || 'Failed to save banner text.');
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
    if (imageEditorIndex === null) return;

    try {
      const product = bannerConfig.products[imageEditorIndex];
      const next = await savePromoBannerProductImage({
        bannerId: bannerConfig.bannerId,
        productId: product?.id,
        position: imageEditorIndex + 1,
        fileDataUrl: imageDraft || null,
        alt: product?.alt || `Promotional product ${imageEditorIndex + 1}`,
      });
      setBannerConfig(next);
      setImageEditorIndex(null);
      setImageDraft('');
      setImageError('');
    } catch (error: any) {
      setImageError(error?.message || 'Failed to save the product image.');
    }
  };

  const deleteImageValue = async (index: number) => {
    if (!window.confirm('Remove this product image from the banner?')) return;

    try {
      const product = bannerConfig.products[index];
      const next = await deletePromoBannerProductImage(product?.id, bannerConfig.bannerId);
      setBannerConfig(next);
    } catch (error: any) {
      setImageError(error?.message || 'Failed to remove the product image.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 pt-4 pb-20 md:pb-8 animate-fadeIn select-none">
      <div className="space-y-8 md:space-y-10">
        <div className="relative isolate w-full overflow-hidden rounded-2xl border border-brand-gold/30 bg-[#f5efe7] shadow-[0_16px_36px_rgba(60,47,27,0.08)]">
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 30% 55%, rgba(217,182,118,0.18), rgba(245,239,231,0) 32%), linear-gradient(90deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 100%)',
            }}
          />

          <div className="relative z-10 flex min-h-[84px] w-full flex-col gap-2 px-3 py-2 text-brand-black sm:min-h-[88px] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-1.5 md:min-h-[88px]">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <div className="relative flex h-[72px] w-[34%] shrink-0 items-end justify-center sm:h-[76px] sm:w-[28%] md:h-[82px] lg:w-[30%]">
                {productSlots.map((slot, index) => {
                  const product = bannerConfig.products[index] || { image: '', alt: `Promotional product ${index + 1}`, enabled: true };
                  const showImage = product.enabled && Boolean(product.image);

                  return (
                    <div key={`promo-image-${index}`} className={`${slot.className} relative`}>
                      {showImage ? (
                        <img
                          src={product.image}
                          alt={product.alt || `Promotional product ${index + 1}`}
                          className={`h-full w-full rounded-[14px] border border-[#1b1713]/70 bg-[linear-gradient(180deg,#ffffff_0%,#f3eadc_100%)] object-cover shadow-[0_18px_22px_rgba(29,22,18,0.13)] ${slot.sizeClass}`}
                        />
                      ) : (
                        <div className="h-full w-full rounded-[14px] border border-[#1b1713]/30 bg-[linear-gradient(180deg,rgba(255,255,255,0.4)_0%,rgba(233,217,195,0.4)_100%)] shadow-[0_12px_18px_rgba(29,22,18,0.08)]" />
                      )}

                      {isAdmin && (
                        <div className="absolute -left-1 top-0 z-20 flex gap-1">
                          <button
                            type="button"
                            aria-label={`Edit product ${index + 1}`}
                            onClick={(e) => { e.stopPropagation(); setImageEditorIndex(index); setImageDraft(product.image || ''); setImageError(''); }}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white/90 text-brand-black shadow-sm transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/70"
                            style={{ touchAction: 'manipulation' }}
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete product ${index + 1}`}
                            onClick={(e) => { e.stopPropagation(); deleteImageValue(index); }}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white/90 text-red-500 shadow-sm transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/70"
                            style={{ touchAction: 'manipulation' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <span className="inline-flex shrink-0 items-center rounded-full border border-brand-black/10 bg-white/70 px-2 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-brand-black shadow-sm sm:px-2.5 sm:text-[9px] sm:tracking-[0.22em] sm:text-[10px]">
                  {bannerConfig.content.campaignLabel}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-bold tracking-[0.04em] text-brand-black sm:text-sm md:text-[15px]">
                    {bannerConfig.content.headline}
                  </p>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    aria-label="Edit promotional text"
                    onClick={() => {
                      setTextDraft({ ...bannerConfig.content });
                      setTextEditorOpen(true);
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white/90 text-brand-black shadow-sm transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/70"
                    style={{ touchAction: 'manipulation' }}
                  >
                    <Edit2 size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-start sm:justify-end">
              <span className="rounded-full bg-brand-black px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-brand-gold shadow-sm sm:text-[10px]">{bannerConfig.content.badge}</span>
            </div>
          </div>
        </div>

        {imageEditorIndex !== null && isAdmin && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
            <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-brand-black">Edit Product Image</h3>
                <button type="button" onClick={() => { setImageEditorIndex(null); setImageDraft(''); setImageError(''); }} className="rounded-full bg-stone-100 p-1.5 text-stone-700"><X size={14} /></button>
              </div>
              {imageError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">{imageError}</div>}
              <div className="mb-3 flex h-24 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
                {imageDraft || bannerConfig.products[imageEditorIndex]?.image ? (
                  <img src={imageDraft || bannerConfig.products[imageEditorIndex]?.image} alt="banner product preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-stone-400">No image</span>
                )}
              </div>
              <label className="mb-4 inline-flex cursor-pointer items-center justify-center rounded-full bg-brand-black px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                Change Image
                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={(e) => handleImageUpload(e.target.files?.[0] || null)} />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setImageEditorIndex(null); setImageDraft(''); setImageError(''); }} className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">Cancel</button>
                <button type="button" onClick={saveImageValue} className="rounded-full bg-brand-black px-3 py-2 text-sm font-semibold text-white">Save</button>
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
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Campaign Label</label>
                  <input value={textDraft.campaignLabel} onChange={(e) => setTextDraft((prev) => ({ ...prev, campaignLabel: e.target.value.slice(0, 30) }))} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-brand-black outline-none focus:border-brand-gold" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Main Message</label>
                  <input value={textDraft.headline} onChange={(e) => setTextDraft((prev) => ({ ...prev, headline: e.target.value.slice(0, 80) }))} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-brand-black outline-none focus:border-brand-gold" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">Badge</label>
                  <input value={textDraft.badge} onChange={(e) => setTextDraft((prev) => ({ ...prev, badge: e.target.value.slice(0, 25) }))} className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-brand-black outline-none focus:border-brand-gold" />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => { setTextEditorOpen(false); setTextError(''); }} className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">Cancel</button>
                <button type="button" onClick={saveTextValues} className="rounded-full bg-brand-black px-3 py-2 text-sm font-semibold text-white">Save</button>
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
