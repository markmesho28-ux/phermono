import React, { useState, useCallback, useEffect } from "react";
import Header from "./components/Header";
import AuthModal from "./components/AuthModal";
import Sidebar from "./components/Sidebar";
import Homepage from "./components/Homepage";
import CategoryView from "./components/CategoryView";
import AboutPage from "./components/AboutPage";
import { CartDrawer, QuickViewModal } from "./components/CartDrawer";
import OrdersManagement from './components/OrdersManagement';
import { useData } from "./contexts/DataContext";
import { useAuth } from "./contexts/AuthContext";
import { CheckCircle2, MessageCircle, Phone, Instagram, Facebook } from "lucide-react";
import ProductCard from "./components/ProductCard";
import ChatWidget from "./components/ChatWidget";
import { formatOrderDate } from "./utils/orderDate";
import type { CartItem, OrderInput, Product } from "./types";

function AssistantPage({ products, sidebarOpen = false }: { products: Product[]; sidebarOpen?: boolean }) {
  return <ChatWidget products={products} mode="page" sidebarOpen={sidebarOpen} />;
}

interface ToastProps {
  message: string;
  visible: boolean;
}

// Simple toast used across the app
function Toast({ message, visible }: ToastProps) {
  return (
    <div
      className={`fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[70] flex items-center justify-center text-center gap-2.5 bg-brand-black/95 text-white border border-brand-gold/40 px-6 py-3.5 rounded-full shadow-2xl text-xs sm:text-sm font-semibold tracking-wide backdrop-blur-md transition-all duration-500 max-md:whitespace-nowrap max-md:px-5 max-md:py-2.5 max-md:text-[11px] max-md:max-w-[90vw] ${
        visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-6 scale-95 pointer-events-none"
      }`}
    >
      <CheckCircle2 size={18} className="text-brand-gold shrink-0" />
      <span className="flex items-center justify-center text-center leading-tight max-md:whitespace-nowrap">{message}</span>
    </div>
  );
}

function GlobalFooter() {
  const whatsappUrl = 'https://wa.me/201010072795';
  const telUrl = 'tel:+201010072795';
  const instagramUrl = 'https://www.instagram.com/phermonostore3?stkn=ZmlsZ3NsZXh0cW52';
  const facebookUrl = 'https://www.facebook.com/share/14pshxhK3vA/?mibextid=wwXIfr';

  return (
    <footer className="w-full border-t border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-4 px-3 py-5 sm:px-6 sm:py-6">
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white transition-transform hover:scale-105"
        >
          <Instagram size={20} />
        </a>

        <a
          href={facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Facebook"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white transition-transform hover:scale-105"
        >
          <Facebook size={20} />
        </a>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white transition-transform hover:scale-105"
        >
          <MessageCircle size={20} />
        </a>

        <a
          href={telUrl}
          aria-label="Call us"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-black text-brand-gold transition-transform hover:scale-105"
        >
          <Phone size={20} />
        </a>
      </div>
    </footer>
  );
}

function TrackingPage() {
  const { orders } = useData();
  const { user } = useAuth();

  if (!user) return (
    <div className="p-6">
      <h2 className="text-lg font-bold">Order Tracking</h2>
      <div className="mt-4 text-sm text-stone-500">Please sign in to view your orders.</div>
    </div>
  );

  const userOrders = orders.filter(o => String(o.phone) === String(user.phone));

  const STAGES = [
    { id: 'confirmed', label: 'Confirmed', ar: 'تم التأكيد' },
    { id: 'preparing', label: 'Preparing', ar: 'يتم التجهيز' },
    { id: 'shipped', label: 'Shipped', ar: 'تم الشحن' },
    { id: 'delivered', label: 'Delivered', ar: 'تم الاستلام' },
  ];

  const stageIndex = (status: string) => {
    const idx = STAGES.findIndex(s => s.id === status);
    return idx >= 0 ? idx : 0;
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Order Tracking</h2>

      {userOrders.length === 0 ? (
        <div className="text-sm text-stone-500">You have no orders yet.</div>
      ) : (
        <div className="space-y-4">
          {userOrders.slice().reverse().map(order => (
            <div key={order.id} className="border rounded-lg p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold">Order #{order.id}</div>
                  <div className="text-xs text-stone-400">Placed: {formatOrderDate(order)}</div>
                </div>
                <div className="text-sm font-medium">Total: EGP {(Number(order?.total) || 0).toFixed(2)}</div>
              </div>

              <div className="mt-4">
                <ol className="flex items-center justify-between">
                  {STAGES.map((s, idx) => {
                    const active = idx <= stageIndex(order.status);
                    return (
                      <li key={s.id} className="flex-1 text-center">
                        <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-2 ${active ? 'bg-brand-gold text-black' : 'bg-stone-100 text-stone-400'}`}>{idx+1}</div>
                        <div className={`text-xs ${active ? 'text-brand-black font-semibold' : 'text-stone-400'}`}>
                          <div>{s.label}</div>
                          <div className="text-[11px] leading-tight mt-0.5">{s.ar}</div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="mt-3 text-sm">
                <div className="text-xs text-stone-500">Items</div>
                <ul className="list-disc list-inside mt-1">
                  {(order.items || []).map(it => <li key={it.id}>{it.name} x{it.qty}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountProfile(){
  const { user, updateProfile, changePassword } = useAuth();
  const [form, setForm] = useState<{ name: string; phone: string; governorate: string; address: string }>({
    name: user?.name || '',
    phone: user?.phone || '',
    governorate: user?.governorate || '',
    address: user?.address || '',
  });
  const [saving, setSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [passState, setPassState] = useState({ current: '', next: '', confirm: '' });
  const [passError, setPassError] = useState('');
  const [passMsg, setPassMsg] = useState('');

  React.useEffect(()=>{
    setForm({
      name: user?.name || '',
      phone: user?.phone || '',
      governorate: user?.governorate || '',
      address: user?.address || '',
    });
  }, [user]);

  const GOVERNORATES = ['أسوان','أسيوط'];

  const saveProfile = async () => {
    setSaving(true);
    setProfileFeedback(null);
    try {
      const updates = {
        name: form.name.trim(),
        phone: String(form.phone).trim(),
        governorate: form.governorate,
        address: form.address.trim(),
      };
      const res = updateProfile ? await updateProfile(updates) : { error: 'Profile update not available' };
      if (res && res.error) {
        setProfileFeedback({ type: 'error', message: res.error });
      } else {
        setProfileFeedback({ type: 'success', message: 'Profile saved successfully!' });
      }
    } catch (err: any) {
      setProfileFeedback({ type: 'error', message: err?.message || 'Failed to save profile' });
    } finally {
      setSaving(false);
      setTimeout(() => {
        setProfileFeedback(null);
      }, 4000);
    }
  };

  const changePass = async () => {
    setPassError('');
    if(!passState.current || !passState.next || !passState.confirm) { setPassError('All fields required'); return; }
    if(passState.next !== passState.confirm){ setPassError('New passwords do not match'); return; }
    const res = changePassword ? changePassword({ currentPassword: passState.current, newPassword: passState.next }) : { error: 'Password change not available' };
    if(res && res.error){ setPassError(res.error); return; }
    setPassState({ current:'', next:'', confirm:'' });
    setPassError('');
    setPassMsg('Password updated successfully');
    setTimeout(()=>setPassMsg(''), 3000);
  };

  if(!user) return (
    <div className="p-4">
      <h2 className="text-lg font-bold">Account Profile</h2>
      <div className="mt-4 text-sm text-stone-500">Please sign in to manage your profile.</div>
    </div>
  );

  return (
    <div
      className="p-4 sm:p-6 max-w-2xl mx-auto w-full"
      style={{ maxHeight: 'calc(100vh - var(--header-height))', overflowY: 'auto', paddingBottom: '6rem' }}
    >
      <h2 className="text-2xl font-bold mb-4">Account Profile</h2>

      <div className="space-y-4">
        <div>
          <label htmlFor="profile-name" className="text-sm font-semibold text-black">Name</label>
          <input
            id="profile-name"
            aria-label="Name"
            className="w-full p-2.5 text-sm bg-white text-black border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold transition-all"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="profile-phone" className="text-sm font-semibold text-black">Phone</label>
          <input
            id="profile-phone"
            aria-label="Phone"
            className="w-full p-2.5 text-sm bg-white text-black border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold transition-all"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="profile-governorate" className="text-sm font-semibold text-black">Governorate</label>
          <select
            id="profile-governorate"
            aria-label="Governorate"
            className="w-full p-2.5 text-sm bg-white text-black border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold transition-all"
            value={form.governorate}
            onChange={e => setForm(f => ({ ...f, governorate: e.target.value }))}
          >
            <option value="">Select governorate</option>
            {GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="profile-address" className="text-sm font-semibold text-black">Address</label>
          <textarea
            id="profile-address"
            aria-label="Address"
            rows={3}
            className="w-full p-2.5 text-sm bg-white text-black border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold transition-all"
            value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          {profileFeedback && (
            <div
              className={`flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl transition-all ${
                profileFeedback.type === 'success'
                  ? 'text-emerald-800 bg-emerald-50 border border-emerald-200 shadow-sm'
                  : 'text-red-800 bg-red-50 border border-red-200 shadow-sm'
              }`}
            >
              {profileFeedback.type === 'success' ? (
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              )}
              <span>{profileFeedback.message}</span>
            </div>
          )}
          {!profileFeedback && <div className="hidden sm:block" />}
          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="px-5 py-2.5 bg-black text-white text-sm font-semibold rounded-xl w-full sm:w-auto touch-target cursor-pointer hover:bg-stone-800 transition-colors disabled:opacity-60 shadow-sm flex items-center justify-center gap-2"
          >
            {saving && (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            <span>{saving ? 'Saving...' : 'Save Profile'}</span>
          </button>
        </div>

        <hr className="my-6 border-stone-200" />

        <h3 className="text-lg font-semibold text-black">Change Password</h3>
        {passError && <div className="text-sm font-medium text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-xl">{passError}</div>}
        {passMsg && <div className="text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-600 shrink-0" />{passMsg}</div>}
        <div className="mt-2 space-y-4">
          <div>
            <label htmlFor="current-password" className="text-sm font-semibold text-black">Current password</label>
            <input id="current-password" aria-label="Current password" type="password" className="w-full p-2.5 text-sm bg-white text-black border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold transition-all" value={passState.current} onChange={e=>setPassState(s=>({...s,current:e.target.value}))} />
          </div>
          <div>
            <label htmlFor="new-password" className="text-sm font-semibold text-black">New password</label>
            <input id="new-password" aria-label="New password" type="password" className="w-full p-2.5 text-sm bg-white text-black border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold transition-all" value={passState.next} onChange={e=>setPassState(s=>({...s,next:e.target.value}))} />
          </div>
          <div>
            <label htmlFor="confirm-password" className="text-sm font-semibold text-black">Confirm new password</label>
            <input id="confirm-password" aria-label="Confirm new password" type="password" className="w-full p-2.5 text-sm bg-white text-black border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold transition-all" value={passState.confirm} onChange={e=>setPassState(s=>({...s,confirm:e.target.value}))} />
          </div>
          <div className="flex justify-end pb-6">
            <button type="button" onClick={changePass} className="px-5 py-2.5 bg-black text-white text-sm font-semibold rounded-xl w-full sm:w-auto touch-target cursor-pointer hover:bg-stone-800 transition-colors shadow-sm">Update Password</button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SearchResultsProps {
  results: Product[];
  onAddToCart: (product: Product) => void;
  onQuickView: (product: Product) => void;
  onWishlist: (product: Product) => void;
  wishlist: Product[];
}

function SearchResults({ results, onAddToCart, onQuickView, onWishlist, wishlist }: SearchResultsProps){
  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 pt-6 pb-20">
      <h2 className="text-2xl font-bold mb-4">Search Results</h2>
      {results.length === 0 ? (
        <div className="text-sm text-stone-500">No items match your search.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {results.map(p => (
            <ProductCard key={p.id} product={p} onAddToCart={onAddToCart} onQuickView={onQuickView} onWishlist={onWishlist} isWishlisted={wishlist.some(w=>w.id===p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

const CART_STORAGE_KEY = 'phermono_cart_v1';

export const getInitialCart = (): CartItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (item): item is CartItem =>
            item !== null &&
            typeof item === 'object' &&
            item.id !== undefined &&
            item.id !== null &&
            typeof item.qty === 'number' &&
            item.qty > 0
        )
        .map((item) => ({
          ...item,
          price: typeof item.price === 'number' ? item.price : (typeof item.sellingPrice === 'number' ? item.sellingPrice : 0),
          qty: Math.max(1, Math.floor(item.qty)),
        }));
    }
  } catch (err) {
    console.warn('Failed to load cart from localStorage:', err);
  }
  return [];
};

export default function App(){
  const [activeCategory, setActiveCategory] = useState('home');
  // profile is rendered as a dedicated page via `activeCategory === 'profile'`
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [cartCheckoutMode, setCartCheckoutMode] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState<string | null>(null);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [toast, setToast] = useState<ToastProps>({ message: '', visible: false });
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const MOBILE_MENU_KEY = 'ui:mobileMenuOpen';
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(() => {
    try {
      const stored = sessionStorage.getItem(MOBILE_MENU_KEY);
      return stored === 'true';
    } catch (err) {
      return false;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(MOBILE_MENU_KEY, mobileMenuOpen ? 'true' : 'false');
    } catch (err) {
      // ignore storage errors
    }
  }, [mobileMenuOpen]);
  const handleMenuToggle = useCallback((forceOpen?: boolean) => {
    setMobileMenuOpen(prev => {
      if (typeof forceOpen === 'boolean') return forceOpen;
      return !prev;
    });
  }, []);

  const handleSidebarClose = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const { products, actions } = useData();
  const { user } = useAuth();

  // cartItems state with immediate localStorage persistence across page reloads
  const [cartItems, setCartItems] = useState<CartItem[]>(() => getInitialCart());

  // Synchronize cartItems to localStorage whenever modified (add, update qty, remove)
  useEffect(() => {
    try {
      if (cartItems.length > 0) {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
      } else {
        localStorage.removeItem(CART_STORAGE_KEY);
      }
    } catch (err) {
      console.warn('Failed to save cart to localStorage:', err);
    }
  }, [cartItems]);

  // Sync across tabs if user modifies cart in another window
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CART_STORAGE_KEY) {
        setCartItems(getInitialCart());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast({ message: msg, visible: true });
    setTimeout(()=> setToast(t => ({ ...t, visible: false })), 2500);
  }, []);

  const handleCategorySelect = useCallback((id: string) => {
    setActiveCategory(id);
    setSelectedBrand(null);
    setSearchQuery('');
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  const handleBrandSelect = useCallback((brandName: string) => {
    const matching = products.find(p=>p.brand===brandName);
    const targetCategory = matching ? matching.category : 'skincare';
    setSelectedBrand(brandName);
    setActiveCategory(targetCategory);
    setSearchQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [products]);

  const handleAddToCart = useCallback((product: Product) => {
    setCartItems(prev => {
      const ex = prev.find(i=>i.id===product.id);
      if(ex) return prev.map(i=> i.id===product.id ? { ...i, qty: i.qty+1 } : i);
      const price = typeof product.sellingPrice === 'number' ? product.sellingPrice : 0;
      return [...prev, { ...product, price, qty: 1 }];
    });
    showToast(`Added "${product.name}" to your bag`);
  }, [showToast]);

  const handleUpdateQty = useCallback((id: number, qty: number) => {
    if(qty <= 0) setCartItems(prev => prev.filter(i=>i.id!==id)); else setCartItems(prev => prev.map(i=> i.id===id ? { ...i, qty } : i));
  }, []);
  const handleRemoveFromCart = useCallback((id: number) => setCartItems(prev => prev.filter(i=>i.id!==id)), []);

  const handleWishlist = useCallback((product: Product) => {
    setWishlist(prev => {
      const exists = prev.find(w=>w.id===product.id);
      if(exists){ showToast('Removed from Favorite List'); return prev.filter(w=>w.id!==product.id); }
      showToast('Added to Favorite List');
      return [...prev, product];
    });
  }, [showToast]);

  // Robust, unconstrained search matching
  const matchProducts = useCallback((query: string) => {
    if(!query || String(query).trim() === '') return [];
    const q = String(query).toLowerCase().trim();
    const tokens = q.split(/\s+/).filter(Boolean);
    return products.filter(p => {
      const name = (p.name || '').toLowerCase();
      const brand = (p.brand || '').toLowerCase();
      const sub = (p.subcategoryId || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      // any token must match any of these fields (multi-word supports)
      return tokens.every(tok => (
        name.includes(tok) || brand.includes(tok) || sub.includes(tok) || desc.includes(tok)
      ));
    });
  }, [products]);

  const searchResults = matchProducts(searchQuery);

  const totalCartCount = cartItems.reduce((s: number, i: CartItem) => s + i.qty, 0);

  const handleCheckoutConfirm = useCallback((order: OrderInput) => {
    // close UI and give feedback
    setCartItems([]);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch (_) {}
    setCartCheckoutMode(false);
    setCartOpen(false);
    showToast('Order placed successfully');
  }, [showToast]);

  // Centralized single-point order placement to avoid duplicates
  const handlePlaceOrder = useCallback((order: OrderInput) => {
    if (actions && typeof actions.addOrder === 'function') {
      actions.addOrder(order);
    }
    handleCheckoutConfirm(order);
  }, [actions, handleCheckoutConfirm]);

  // Update account/avatar button styling for high contrast for both logged-in and guest states.
  React.useEffect(() => {
    const applyAvatarStyle = () => {
      try {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const b of buttons) {
          const txt = (b.textContent || '').trim();
          if (!txt) continue;

          // If user is signed in, match the button that contains the user's name
          if (user && user.name && txt.indexOf(user.name) !== -1) {
            b.style.background = '#f59e0b'; // brand gold
            b.style.color = '#0b0b0b'; // dark text for contrast
            b.style.fontWeight = '700';
            b.style.borderRadius = '9999px';
            b.style.padding = '0.45rem 0.9rem';
            b.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
            const svg = b.querySelector('svg');
            if (svg) svg.style.color = '#0b0b0b';
            break;
          }

          // If no user, style the guest 'Account' trigger the same way
          if (!user && (txt === 'Account' || txt.toLowerCase().includes('account'))) {
            b.style.background = '#f59e0b';
            b.style.color = '#0b0b0b';
            b.style.fontWeight = '700';
            b.style.borderRadius = '9999px';
            b.style.padding = '0.45rem 0.9rem';
            b.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
            const svg = b.querySelector('svg');
            if (svg) svg.style.color = '#0b0b0b';
            break;
          }
        }
      } catch (err) {
        /* no-op */
      }
    };

    applyAvatarStyle();
    const header = document.querySelector('header');
    if (!header) return;
    const mo = new MutationObserver(() => applyAvatarStyle());
    mo.observe(header, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [user]);

  return (
    <div className="min-h-screen bg-brand-cream text-brand-black flex flex-col font-sans selection:bg-brand-gold selection:text-brand-black">
      <style>{`
        /* Hide top banner pharmacy subtitle */
        .bg-brand-black .text-stone-300 { display: none !important; }
        /* Hide category hero subtitle */
        .relative.overflow-hidden .relative.z-10 .text-stone-300 { display: none !important; }

        .header-wishlist-btn,
        .header-cart-btn,
        .header-track-btn,
        .header-assistant-btn {
          white-space: nowrap !important;
          flex-shrink: 1 !important;
        }
      `}</style>
      <Header
        cartCount={totalCartCount}
        wishlistCount={wishlist.length}
        cartOpen={cartOpen}
        onCartOpen={() => { if(user) setCartOpen(true); else { setAuthIntent('openCart'); setAuthOpen(true); } }}
        onTrackOpen={() => { if(user) setActiveCategory('tracking'); else { setAuthIntent('openTracking'); setAuthOpen(true); } }}
        onAssistantOpen={() => {
          setActiveCategory('assistant');
          setSelectedBrand(null);
          setSearchQuery('');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onProfileOpen={() => { if(user) setActiveCategory('profile'); else { setAuthIntent('openProfile'); setAuthOpen(true); } }}
        onWishlistOpen={() => setActiveCategory('favorites')}
        searchQuery={searchQuery}
        onSearchChange={(q)=>{ setSearchQuery(q); if(q && activeCategory==='home'){ setActiveCategory('skincare'); setSelectedBrand(null); } }}
        onHomeClick={() => { setActiveCategory('home'); setSelectedBrand(null); setSearchQuery(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        onAuthOpen={(v)=>{
          // If user is already signed in, navigate to profile page instead of showing auth modal
          if (user) {
            setActiveCategory('profile');
            setAuthIntent(null);
            setAuthOpen(false);
            return;
          }
          setAuthIntent(null);
          setAuthOpen(!!v);
        }}
        onMenuToggle={handleMenuToggle}
        isMenuOpen={mobileMenuOpen}
      />

      <div className="flex-1 flex max-w-7xl mx-auto w-full relative pointer-events-auto">
        <Sidebar
          activeCategory={activeCategory}
          onSelect={handleCategorySelect}
          mobileOpen={mobileMenuOpen}
          onClose={handleSidebarClose}
        />

        <main className="flex-1 min-w-0 px-2 sm:px-4">
          {searchQuery && String(searchQuery).trim() !== '' ? (
            <SearchResults results={searchResults} onAddToCart={handleAddToCart} onQuickView={(product: Product) => setQuickViewProduct(product)} onWishlist={handleWishlist} wishlist={wishlist} />
          ) : activeCategory === 'assistant' ? (
            <AssistantPage products={products} sidebarOpen={mobileMenuOpen} />
          ) : activeCategory === 'home' ? (
            <Homepage onCategorySelect={handleCategorySelect} onBrandSelect={handleBrandSelect} onAddToCart={handleAddToCart} onQuickView={(product: Product) => setQuickViewProduct(product)} onWishlist={handleWishlist} wishlist={wishlist} />
          ) : activeCategory === 'about' ? (
            <AboutPage
              onNavigateHome={() => { setActiveCategory('home'); setSelectedBrand(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              onNavigateAssistant={() => { setActiveCategory('assistant'); setSelectedBrand(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            />
          ) : activeCategory === 'tracking' ? (
            <TrackingPage />
          ) : activeCategory === 'profile' ? (
            <AccountProfile />
          ) : activeCategory === 'favorites' ? (
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Favorite List</h2>
              </div>

              {wishlist.length === 0 ? (
                <div className="text-sm text-stone-500">You have no saved favorites yet.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {wishlist.map(p => (
                    <ProductCard key={p.id} product={p} onAddToCart={handleAddToCart} onQuickView={(product: Product) => setQuickViewProduct(product)} onWishlist={handleWishlist} isWishlisted={true} />
                  ))}
                </div>
              )}
            </div>
          ) : activeCategory === 'orders' ? (
            <OrdersManagement />
          ) : (
            <CategoryView categoryId={activeCategory} initialBrand={selectedBrand} searchQuery={searchQuery} onAddToCart={handleAddToCart} onQuickView={(product: Product) => setQuickViewProduct(product)} onWishlist={handleWishlist} wishlist={wishlist} />
          )}
        </main>
      </div>

      {activeCategory !== 'about' && <GlobalFooter />}

      <CartDrawer
        isOpen={cartOpen}
        onClose={() => { setCartOpen(false); setCartCheckoutMode(false); }}
        cartItems={cartItems}
        onUpdateQty={handleUpdateQty}
        onRemove={handleRemoveFromCart}
        checkoutMode={cartCheckoutMode}
        user={user}
        onBackToBag={() => setCartCheckoutMode(false)}
        onPlaceOrder={handlePlaceOrder}
        onCheckout={() => {
          if(user){ setCartCheckoutMode(true); } else { setAuthIntent('checkout'); setAuthOpen(true); }
        }}
      />

      {quickViewProduct && (
        <QuickViewModal product={quickViewProduct} onClose={()=>setQuickViewProduct(null)} onAddToCart={handleAddToCart} onWishlist={handleWishlist} isWishlisted={wishlist.some((w: Product) => w.id === quickViewProduct.id)} />
      )}

      {/* Profile and Wishlist are now dedicated full-page views handled by `activeCategory` */}

      <AuthModal open={authOpen} onClose={()=>{ setAuthOpen(false); setAuthIntent(null); }} onSuccess={(u)=>{ setAuthOpen(false); if(authIntent === 'openCart'){ setCartOpen(true); } else if(authIntent === 'checkout'){ setCartOpen(true); setCartCheckoutMode(true); } else if(authIntent === 'openTracking'){ setActiveCategory('tracking'); } else if(authIntent === 'openProfile'){ setActiveCategory('profile'); } setAuthIntent(null); }} />

      {/* Add Category Modal */}
      {isAddCategoryModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsAddCategoryModalOpen(false);
              setNewCategoryName('');
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md bg-white border border-stone-200 rounded-2xl p-6 shadow-2xl pointer-events-auto animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-brand-black mb-3">إضافة فئة جديدة / Add Category</h3>
            <label className="text-xs font-semibold text-stone-700 mb-1.5 block">اسم الفئة</label>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 mb-4 rounded-xl bg-stone-50 border border-stone-200 text-base text-brand-black placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold pointer-events-auto"
              style={{ fontSize: '16px' }}
              placeholder="مثال: المكياج"
              autoComplete="off"
            />

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setIsAddCategoryModalOpen(false); setNewCategoryName(''); }}
                className="px-4 py-2 rounded-xl bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 touch-target cursor-pointer pointer-events-auto"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  const label = String(newCategoryName || '').trim();
                  if (!label) return;
                  const id = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `cat-${Date.now()}`;
                  actions.addCategory({ id, label, icon: 'Sparkles', color: '', accent: '', subcategories: [{ id: 'all', label: 'All' }], brands: [] });
                  setIsAddCategoryModalOpen(false);
                  setNewCategoryName('');
                  showToast('Category added');
                }}
                className="px-5 py-2 rounded-xl bg-brand-gold text-brand-black font-semibold hover:brightness-95 touch-target cursor-pointer pointer-events-auto shadow-sm"
              >
                إضافة
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
