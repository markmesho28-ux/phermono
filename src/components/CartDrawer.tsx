import React from "react";
import {
  ShoppingBag,
  Heart,
  X,
  Plus,
  Minus,
  Trash2,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

import type { AuthUser, CartItem, OrderInput, Product } from "../types";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQty: (id: number, qty: number) => void;
  onRemove: (id: number) => void;
  onCheckout?: () => void;
  checkoutMode?: boolean;
  onBackToBag?: () => void;
  onPlaceOrder?: (order: OrderInput) => void;
  user?: AuthUser | null;
}

interface CartItemRowProps {
  item: CartItem;
  onUpdateQty: (id: number, qty: number) => void;
  onRemove: (id: number) => void;
}

interface QuickViewModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
  onWishlist: (product: Product) => void;
  isWishlisted: boolean;
}

// ─── SLIDE-OVER LUXURY CART DRAWER ─────────────────────────────────────────────
export function CartDrawer({
  isOpen,
  onClose,
  cartItems,
  onUpdateQty,
  onRemove,
  onCheckout,
  checkoutMode = false,
  onBackToBag,
  onPlaceOrder,
  user,
}: CartDrawerProps) {
  const subtotal = cartItems.reduce((s: number, i: CartItem) => s + i.price * i.qty, 0);

  const getShippingFee = (governorate?: string) => {
    // Flat rate of 50 for supported governorates; fallback to 50.
    return 50;
  };

  const shippingFee = getShippingFee();
  const total = subtotal + shippingFee;

  const headerContent = checkoutMode ? (
    <>
      <button
        type="button"
        onClick={() => onBackToBag && onBackToBag()}
        className="px-3 py-2 text-xs font-semibold text-stone-600 hover:text-brand-black"
      >
        ← Back to Bag
      </button>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-black text-brand-gold flex items-center justify-center">
          <ShieldCheck size={18} />
        </div>
        <div>
          <h2 className="font-serif-luxury text-2xl font-bold text-brand-black">Checkout</h2>
          <p className="text-xs text-stone-500">Complete your order</p>
        </div>
      </div>
    </>
  ) : (
    <>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-black text-brand-gold flex items-center justify-center">
          <ShoppingBag size={18} />
        </div>
        <div>
          <h2 className="font-serif-luxury text-2xl font-bold text-brand-black">Your Bag</h2>
          <p className="font-tagline text-xs text-brand-gold font-semibold">
            Ur favorite Mono choice
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-brand-black/60 backdrop-blur-sm z-50 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[440px] bg-white z-50 flex flex-col shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:h-[82vh] max-md:max-h-[82vh] max-md:w-full max-md:rounded-t-[28px] max-md:border-t max-md:border-brand-gold-border/40 max-md:overflow-hidden ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-brand-gold-border/40 bg-brand-cream/60 max-md:px-4 max-md:py-4">
          {headerContent}
          <button
            onClick={onClose}
            className="p-2 md:p-3 rounded-full hover:bg-stone-200 text-stone-500 hover:text-brand-black transition-colors touch-target"
            aria-label={checkoutMode ? "Close Checkout" : "Close Bag"}
          >
            <X size={20} />
          </button>
        </div>

        {checkoutMode ? (
          <div className="flex-1 overflow-y-auto px-6 py-4 max-md:px-4 max-md:pb-[calc(env(safe-area-inset-bottom)+5rem)]">
            <div className="space-y-4">
              {user && (
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
                  <span className="font-semibold text-brand-black">Delivering to:</span> {user.name} · {user.governorate || 'No governorate selected'}
                </div>
              )}
              <div className="space-y-4">
                <div className="bg-stone-50 rounded-2xl p-4">
                  <div className="flex justify-between text-sm text-stone-600 mb-2">
                    <span>Subtotal</span>
                    <span className="font-semibold text-brand-black">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-stone-600 mb-2">
                    <span>Shipping</span>
                    <span className="font-semibold text-emerald-700">${shippingFee.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-stone-200 pt-2 flex justify-between text-base font-bold text-brand-black">
                    <span>Total</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-white p-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 mb-2">Checkout details</div>
                  {user ? (
                    <div className="space-y-2 text-sm text-stone-600">
                      <div><span className="font-semibold text-brand-black">Name:</span> {user.name}</div>
                      <div><span className="font-semibold text-brand-black">Phone:</span> {user.phone}</div>
                      <div><span className="font-semibold text-brand-black">Address:</span> {user.address || 'No address set'}</div>
                    </div>
                  ) : (
                    <div className="text-sm text-stone-500">Please sign in to complete checkout.</div>
                  )}
                </div>
              </div>

              {user && onPlaceOrder && (
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => onBackToBag && onBackToBag()}
                    className="flex-1 rounded-full border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-700"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const order: OrderInput = {
                        name: user.name,
                        phone: user.phone,
                        governorate: user.governorate,
                        address: user.address || '',
                        items: cartItems.map((item) => ({ id: item.id, name: item.name, qty: item.qty, price: item.price })),
                        total,
                        shipping: shippingFee,
                        status: 'confirmed',
                        createdAt: Date.now(),
                      };
                      onPlaceOrder(order);
                    }}
                    className="flex-1 rounded-full bg-brand-black px-4 py-3 text-sm font-semibold text-white shadow-lg"
                  >
                    Place Order
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 max-md:px-4 max-md:pb-24 max-md:pt-3">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-20 h-20 rounded-full bg-brand-gold-light flex items-center justify-center mb-4 border border-brand-gold/30">
                    <ShoppingBag size={32} className="text-brand-gold-dark" />
                  </div>
                  <h3 className="font-serif-luxury text-2xl font-bold text-brand-black mb-1">
                    Your Bag is Empty
                  </h3>
                  <p className="text-xs text-stone-400 max-w-xs mb-6">
                    Discover our luxury skincare, perfumes, and pharmacy essentials.
                  </p>
                  <button
                    onClick={onClose}
                    className="px-6 py-3 bg-brand-black text-brand-gold text-xs font-bold uppercase tracking-wider rounded-full hover:bg-brand-charcoal transition-all shadow-md"
                  >
                    Start Shopping
                  </button>
                </div>
              ) : (
                cartItems.map((item) => (
                  <CartItemRow
                    key={item.id}
                    item={item}
                    onUpdateQty={onUpdateQty}
                    onRemove={onRemove}
                  />
                ))
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="p-6 border-t border-brand-gold-border/40 bg-brand-cream/80 space-y-4 max-md:p-4 max-md:pb-[calc(env(safe-area-inset-bottom)+1.25rem)] max-md:shadow-[0_-12px_24px_rgba(0,0,0,0.04)]">
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-stone-500">
                    <span>Subtotal</span>
                    <span className="font-semibold text-brand-black">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-stone-500 text-xs">
                    <span>Pharmacy Shipping</span>
                    <span className="text-emerald-700 font-bold">${shippingFee.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-stone-200 pt-2 flex justify-between text-base font-bold text-brand-black">
                    <span>Total Amount</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={() => onCheckout && onCheckout()}
                  className="w-full py-4 bg-brand-black hover:bg-brand-gold hover:text-brand-black text-brand-gold rounded-full font-bold text-xs uppercase tracking-widest shadow-luxury transition-all duration-300 flex items-center justify-center gap-2 group"
                >
                  <span>Checkout Order</span>
                  <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
                </button>

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-400 text-center">
                  <ShieldCheck size={13} className="text-brand-gold" />
                  <span>100% Genuine Pharmacy Certified Formulations</span>
                </div>
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}

function CartItemRow({ item, onUpdateQty, onRemove }: CartItemRowProps) {
  return (
    <div className="flex gap-4 p-3 bg-brand-cream/50 rounded-2xl border border-stone-100 shadow-sm">
      <div className="w-20 h-20 rounded-xl overflow-hidden bg-white shrink-0 border border-stone-200">
        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <span className="text-[10px] font-bold text-brand-gold-dark uppercase tracking-wider">
            {item.brand}
          </span>
          <h4 className="text-xs font-bold text-brand-black truncate leading-tight mt-0.5">
            {item.name}
          </h4>
          <span className="text-xs font-extrabold text-brand-black mt-1 block">
            ${(item.price * item.qty).toFixed(2)}
          </span>
        </div>

        <div className="flex items-center justify-between mt-2">
          {/* Quantity Controls */}
          <div className="flex items-center bg-white border border-stone-200 rounded-full px-2 py-0.5 shadow-inner">
            <button
              onClick={() => onUpdateQty(item.id, item.qty - 1)}
              className="p-2 md:p-2.5 text-stone-500 hover:text-brand-black touch-target"
              aria-label="Decrease quantity"
            >
              <Minus size={13} />
            </button>
            <span className="text-xs font-bold text-brand-black w-6 text-center">
              {item.qty}
            </span>
            <button
              onClick={() => onUpdateQty(item.id, item.qty + 1)}
              className="p-2 md:p-2.5 text-stone-500 hover:text-brand-black touch-target"
              aria-label="Increase quantity"
            >
              <Plus size={13} />
            </button>
          </div>

          <button
            onClick={() => onRemove(item.id)}
            className="text-stone-300 hover:text-red-500 p-2 md:p-2.5 transition-colors touch-target"
            aria-label="Remove item"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── QUICK VIEW MODAL ─────────────────────────────────────────────────────────
export function QuickViewModal({ product, onClose, onAddToCart, onWishlist, isWishlisted }: QuickViewModalProps) {
  if (!product) return null;

  const marketP = product ? (typeof product.marketPrice === 'number' ? product.marketPrice : product.originalPrice) : undefined;
  const sellP = product ? (typeof product.sellingPrice === 'number' ? product.sellingPrice : product.price || 0) : 0;
  const discount = marketP ? Math.round(((marketP - sellP) / marketP) * 100) : null;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-brand-black/70 backdrop-blur-md z-50 animate-fadeIn"
      />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden pointer-events-auto border border-brand-gold-border/60 animate-slideUp flex flex-col md:flex-row">
          
          {/* Image Stage */}
          <div className="md:w-1/2 relative bg-brand-sand/40 p-6 flex items-center justify-center">
            <img
              src={product.image}
              alt={product.name}
              className="max-h-72 md:max-h-96 w-full object-cover rounded-2xl shadow-md"
            />
            {product.tag === 'Best Seller' && (
              <span className="absolute top-4 left-4 bg-brand-gold text-brand-black font-extrabold text-[8px] px-2 py-0.5 rounded-full leading-none shadow-sm border border-[#c38d2d] tracking-[0.11em] uppercase">
                BEST SELLER
              </span>
            )}
            {product.tag === 'New' && (
              <span className="absolute top-4 left-4 bg-white/90 text-brand-black border border-stone-200 shadow-sm font-bold text-[10px] uppercase px-3 py-1 rounded-full">
                NEW
              </span>
            )}
            {discount && (
              <span className="absolute top-4 right-4 bg-brand-gold text-brand-black font-extrabold text-[10px] px-2.5 py-1 rounded-full shadow-sm">
                SAVE {discount}%
              </span>
            )}
          </div>

          {/* Details */}
          <div className="md:w-1/2 p-6 sm:p-8 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-widest text-brand-gold-dark">
                    {product.brand}
                  </span>
                  <h3 className="font-serif-luxury text-2xl font-bold text-brand-black leading-tight mt-1">
                    {product.name}
                  </h3>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-stone-100 text-stone-400 hover:text-brand-black"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Ratings removed per request (visual stars and rating text omitted) */}

              {/* Description */}
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed mb-6">
                {product.description}
              </p>

              {/* Skin Type Badge */}
              {product.skinType && (
                <div className="mb-6 flex items-center gap-2">
                  <span className="text-xs text-stone-400">Target Type:</span>
                  <span className="text-xs font-bold text-brand-black bg-brand-gold-light border border-brand-gold-border px-3 py-1 rounded-full">
                    {product.skinType} Skin
                  </span>
                </div>
              )}
            </div>

            {/* Price and CTA */}
            <div className="pt-4 border-t border-stone-100">
              <div className="flex items-baseline gap-3 mb-4">
                {(() => {
                  const market = typeof product.marketPrice === 'number' ? product.marketPrice : product.originalPrice;
                  const sell = typeof product.sellingPrice === 'number' ? product.sellingPrice : (product.price || 0);
                  return (
                    <>
                      <span className="text-3xl font-extrabold text-brand-black">${sell.toFixed(2)}</span>
                      {market != null && (
                        <span className="text-base text-stone-400 line-through">${market.toFixed(2)}</span>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    onAddToCart(product);
                    onClose();
                  }}
                  className="flex-1 py-3.5 bg-brand-black hover:bg-brand-gold hover:text-brand-black text-brand-gold rounded-full font-bold text-xs uppercase tracking-wider shadow-luxury transition-all flex items-center justify-center gap-2"
                >
                  <ShoppingBag size={15} />
                  <span>Add to Bag</span>
                </button>

                <button
                  onClick={() => onWishlist(product)}
                  className={`p-3.5 rounded-full border transition-all ${
                    isWishlisted
                      ? "bg-red-50 text-red-500 border-red-200"
                      : "border-stone-200 text-stone-400 hover:text-red-500 hover:bg-red-50"
                  }`}
                  aria-label="Add to Favorite List"
                >
                  <Heart size={18} fill={isWishlisted ? "currentColor" : "none"} />
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
