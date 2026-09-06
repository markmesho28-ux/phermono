import React, { useState, useCallback } from "react";
import Header from "./components/Header";
import AuthModal from "./components/AuthModal";
import Sidebar from "./components/Sidebar";
import BottomNav from "./components/BottomNav";
import Homepage from "./components/Homepage";
import CategoryView from "./components/CategoryView";
import { CartDrawer, QuickViewModal } from "./components/CartDrawer";
import OrdersManagement from './components/OrdersManagement';
import { useData } from "./contexts/DataContext";
import { useAuth } from "./contexts/AuthContext";
import { CheckCircle2 } from "lucide-react";
import ProductCard from "./components/ProductCard";
import ChatWidget from "./components/ChatWidget";
import type { AuthUser, CartItem, OrderInput, Product } from "./types";

interface ToastProps {
  message: string;
  visible: boolean;
}

// Simple toast used across the app
function Toast({ message, visible }: ToastProps) {
  return (
    <div
      className={`fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 bg-brand-black/95 text-white border border-brand-gold/40 px-6 py-3.5 rounded-full shadow-2xl text-xs sm:text-sm font-semibold tracking-wide backdrop-blur-md transition-all duration-500 ${
        visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-6 scale-95 pointer-events-none"
      }`}
    >
      <CheckCircle2 size={18} className="text-brand-gold shrink-0" />
      <span>{message}</span>
    </div>
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
    { id: 'confirmed', label: 'Confirmed (تم التأكيد)' },
    { id: 'preparing', label: 'Preparing (يتم التجهيز)' },
    { id: 'shipped', label: 'Shipped (تم الشحن)' },
    { id: 'delivered', label: 'Delivered (تم الاستلام)' },
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
                  <div className="text-xs text-stone-400">Placed: {new Date(order.createdAt).toLocaleString()}</div>
                </div>
                <div className="text-sm font-medium">Total: ${order.total.toFixed(2)}</div>
              </div>

              <div className="mt-4">
                <ol className="flex items-center justify-between">
                  {STAGES.map((s, idx) => {
                    const active = idx <= stageIndex(order.status);
                    return (
                      <li key={s.id} className="flex-1 text-center">
                        <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-2 ${active ? 'bg-brand-gold text-black' : 'bg-stone-100 text-stone-400'}`}>{idx+1}</div>
                        <div className={`text-xs ${active ? 'text-brand-black font-semibold' : 'text-stone-400'}`}>{s.label}</div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="mt-3 text-sm">
                <div className="text-xs text-stone-500">Items</div>
                <ul className="list-disc list-inside mt-1">
                  {order.items.map(it => <li key={it.id}>{it.name} x{it.qty}</li>)}
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
  const [form, setForm] = useState<{ name: string; phone: string; governorate: string; address: string }>({ name: user?.name||'', phone: user?.phone||'', governorate: user?.governorate||'', address: user?.address||'' });
  const [saving, setSaving] = useState(false);
  const [passState, setPassState] = useState({ current: '', next: '', confirm: '' });
  const [passError, setPassError] = useState('');
  const [msg, setMsg] = useState('');

  React.useEffect(()=>{
    setForm({ name: user?.name||'', phone: user?.phone||'', governorate: user?.governorate||'', address: user?.address||'' });
  }, [user]);

  

  

  

  

  const GOVERNORATES = [
    'Cairo','Giza','Alexandria','Dakahlia','Red Sea','Beheira','Fayoum','Gharbia','Ismailia','Kafr El Sheikh','Matruh','Minya','Monufia','New Valley','North Sinai','Port Said','Qalyubia','Qena','Sharqia','Sohag','South Sinai','Aswan','Asyut'
  ];

  const saveProfile = async () => {
    setSaving(true);
    const updates = { name: form.name.trim(), phone: String(form.phone).trim(), governorate: form.governorate, address: form.address.trim() };
    const res = updateProfile ? updateProfile(updates) : { error: 'Profile update not available' };
    if (res && res.error) setMsg(res.error); else setMsg('Profile saved');
    setTimeout(()=>setMsg(''),2000);
    setSaving(false);
  };

  const changePass = async () => {
    setPassError('');
    if(!passState.current || !passState.next || !passState.confirm) { setPassError('All fields required'); return; }
    if(passState.next !== passState.confirm){ setPassError('New passwords do not match'); return; }
    const res = changePassword ? changePassword({ currentPassword: passState.current, newPassword: passState.next }) : { error: 'Password change not available' };
    if(res && res.error){ setPassError(res.error); return; }
    setPassState({ current:'', next:'', confirm:'' });
    setPassError('');
    setMsg('Password updated');
    setTimeout(()=>setMsg(''),2000);
  };

  if(!user) return (
    <div className="p-6">
      <h2 className="text-lg font-bold">Account Profile</h2>
      <div className="mt-4 text-sm text-stone-500">Please sign in to manage your profile.</div>
    </div>
  );

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-bold mb-4">Account Profile</h2>

      <div className="space-y-3">
        <div>
          <label htmlFor="profile-name" className="text-sm font-semibold text-black">Name</label>
          <input id="profile-name" aria-label="Name" className="w-full p-2 bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
        </div>
        <div>
          <label htmlFor="profile-phone" className="text-sm font-semibold text-black">Phone</label>
          <input id="profile-phone" aria-label="Phone" className="w-full p-2 bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} />
        </div>
        <div>
          <label htmlFor="profile-governorate" className="text-sm font-semibold text-black">Governorate</label>
          <select id="profile-governorate" aria-label="Governorate" className="w-full p-2 bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={form.governorate} onChange={e=>setForm({...form,governorate:e.target.value})}>
            <option value="">Select governorate</option>
            {GOVERNORATES.map(g=> <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="profile-address" className="text-sm font-semibold text-black">Address</label>
          <textarea id="profile-address" aria-label="Address" className="w-full p-2 bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} />
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={saveProfile} disabled={saving} className="px-4 py-2 bg-black text-white rounded">{saving ? 'Saving...' : 'Save Profile'}</button>
        </div>

        <hr className="my-4" />

        <h3 className="text-lg font-semibold">Change Password</h3>
        {passError && <div className="text-sm text-red-700">{passError}</div>}
        <div className="mt-2 space-y-3">
          <div>
            <label htmlFor="current-password" className="text-sm font-semibold text-black">Current password</label>
            <input id="current-password" aria-label="Current password" type="password" className="w-full p-2 bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={passState.current} onChange={e=>setPassState(s=>({...s,current:e.target.value}))} />
          </div>
          <div>
            <label htmlFor="new-password" className="text-sm font-semibold text-black">New password</label>
            <input id="new-password" aria-label="New password" type="password" className="w-full p-2 bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={passState.next} onChange={e=>setPassState(s=>({...s,next:e.target.value}))} />
          </div>
          <div>
            <label htmlFor="confirm-password" className="text-sm font-semibold text-black">Confirm new password</label>
            <input id="confirm-password" aria-label="Confirm new password" type="password" className="w-full p-2 bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={passState.confirm} onChange={e=>setPassState(s=>({...s,confirm:e.target.value}))} />
          </div>
          <div className="flex justify-end">
            <button onClick={changePass} className="px-4 py-2 bg-black text-white rounded">Update Password</button>
          </div>
        </div>

        {msg && <div className="text-sm text-green-600">{msg}</div>}
      </div>
    </div>
  );
}

interface InlineCheckoutFormProps {
  user: AuthUser | null;
  cartItems: CartItem[];
  subtotal: number;
  onCancel: () => void;
  onConfirm: (order: OrderInput) => void;
}

function InlineCheckoutForm({ user, cartItems, subtotal, onCancel, onConfirm }: InlineCheckoutFormProps){
  const GOVERNORATES = [
    'Cairo','Giza','Alexandria','Dakahlia','Red Sea','Beheira','Fayoum','Gharbia','Ismailia','Kafr El Sheikh','Matruh','Minya','Monufia','New Valley','North Sinai','Port Said','Qalyubia','Qena','Sharqia','Sohag','South Sinai','Aswan','Asyut'
  ];
  const [form, setForm] = useState<{ name: string; phone: string; governorate: string; address: string }>({ name: user?.name || '', phone: user?.phone || '', governorate: user?.governorate || '', address: user?.address || '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if(!form.name || String(form.name).trim() === '') e.name = 'Required';
    if(!form.phone || String(form.phone).trim() === '') e.phone = 'Required';
    if(!form.governorate) e.governorate = 'Required';
    if(!form.address || String(form.address).trim() === '') e.address = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const [submitting, setSubmitting] = useState(false);

  // Keep form in sync when the authenticated user changes (prefill governorate, name, phone, address)
  React.useEffect(() => {
    setForm({
      name: user?.name || '',
      phone: user?.phone || '',
      governorate: user?.governorate || '',
      address: user?.address || ''
    });
  }, [user]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (submitting) return;
    if(!validate()) return;
    setSubmitting(true);
    const shipping = subtotal >= 50 ? 0 : 4.99;
    const total = +(subtotal + shipping).toFixed(2);
    const order: OrderInput = { name: form.name.trim(), phone: form.phone.trim(), governorate: form.governorate, address: form.address.trim(), items: cartItems.map((i: CartItem)=>({ id: i.id, name: i.name, qty: i.qty, price: i.price })), total, status: 'confirmed', createdAt: Date.now() };
    // Do NOT call actions.addOrder here to avoid duplicate persistence.
    // The parent component (App) will persist once in its onConfirm handler.
    if(onConfirm) onConfirm(order);
    // re-enable submit after small delay to avoid accidental double clicks
    setTimeout(()=>setSubmitting(false), 1200);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-semibold text-black">Name</label>
        <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full p-2 bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" />
        {errors.name && <div className="text-xs text-red-600">{errors.name}</div>}
      </div>
      <div>
        <label className="text-sm font-semibold text-black">Phone</label>
        <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="w-full p-2 bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" />
        {errors.phone && <div className="text-xs text-red-600">{errors.phone}</div>}
      </div>
      <div>
        <label className="text-sm font-semibold text-black">Governorate</label>
        <select value={form.governorate} onChange={e=>setForm({...form,governorate:e.target.value})} className="w-full p-2 bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold">
          <option value="">Select governorate</option>
          {GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {errors.governorate && <div className="text-xs text-red-600">{errors.governorate}</div>}
      </div>
      <div>
        <label className="text-sm font-semibold text-black">Address</label>
        <textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})} className="w-full p-2 bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" />
        {errors.address && <div className="text-xs text-red-600">{errors.address}</div>}
      </div>

      <div className="bg-stone-50 p-3 rounded">
        <div className="flex justify-between text-sm text-stone-600"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between text-sm text-stone-600"><span>Shipping</span><span>${(subtotal>=50?0:4.99).toFixed(2)}</span></div>
        <div className="flex justify-between text-base font-bold text-brand-black mt-2"><span>Total</span><span>${(subtotal + (subtotal>=50?0:4.99)).toFixed(2)}</span></div>
      </div>

      <form onSubmit={submit} className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-2">Cancel</button>
        <button type="submit" disabled={submitting} className="px-3 py-2 bg-black text-white rounded">{submitting ? 'Placing...' : 'Place Order'}</button>
      </form>
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

export default function App(){
  const [activeCategory, setActiveCategory] = useState('home');
  // profile is rendered as a dedicated page via `activeCategory === 'profile'`
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [inlineCheckoutOpen, setInlineCheckoutOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState<string | null>(null);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [toast, setToast] = useState<ToastProps>({ message: '', visible: false });
  // wishlist is rendered as a dedicated page via `activeCategory === 'favorites'`

  const { products, actions } = useData();
  const { user } = useAuth();

  // sample cartItems state (could be driven by CartContext in a fuller app)
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast({ message: msg, visible: true });
    setTimeout(()=> setToast(t => ({ ...t, visible: false })), 2500);
  }, []);

  const handleCategorySelect = useCallback((id: string) => { setActiveCategory(id); setSelectedBrand(null); setSearchQuery(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
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
      const price = typeof product.sellingPrice === 'number' ? product.sellingPrice : (typeof product.price === 'number' ? product.price : 0);
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
      if(exists){ showToast('Removed from your wishlist'); return prev.filter(w=>w.id!==product.id); }
      showToast(`Saved "${product.name}" to wishlist`);
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
      const sub = (p.subcategory || '').toLowerCase();
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
    setInlineCheckoutOpen(false);
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

  // Attach click wiring to header's wishlist button (header not modified here)
  React.useEffect(() => {
    const sel = 'button[aria-label="Wishlist"]';
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest?.(sel);
      if (btn) {
        e.preventDefault();
        // Navigate to dedicated favorites page
        setActiveCategory('favorites');
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

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
        /* Clear search placeholder */
        input::placeholder { color: transparent !important; }
        /* Style header wishlist button to match bag */
        button[aria-label="Wishlist"] { background: #000 !important; color: #fff !important; padding: 0.6rem 0.9rem !important; border-radius: 9999px !important; display: inline-flex !important; align-items: center; gap: .6rem; box-shadow: 0 6px 20px rgba(0,0,0,0.12); }
        button[aria-label="Wishlist"] svg { color: #f59e0b !important; }
        button[aria-label="Wishlist"]::after { content: 'Favorite List'; color: #fff; font-weight: 700; font-size: 12px; margin-left: 6px; }
        /* Style tracking button similar to bag */
        button[aria-label="Track Orders"] { background: #000 !important; color: #fff !important; padding: 0.6rem 0.9rem !important; border-radius: 9999px !important; display: inline-flex !important; align-items: center; gap: .6rem; box-shadow: 0 6px 20px rgba(0,0,0,0.12); margin-left: .5rem; }
        button[aria-label="Track Orders"] svg { color: #f59e0b !important; }
        button[aria-label="Track Orders"]::after { content: 'Track Your Order'; color: #fff; font-weight: 700; font-size: 12px; margin-left: 6px; }
      `}</style>
      <Header
        cartCount={totalCartCount}
        wishlistCount={wishlist.length}
        onCartOpen={() => { if(user) setCartOpen(true); else { setAuthIntent('openCart'); setAuthOpen(true); } }}
        onTrackOpen={() => { if(user) setActiveCategory('tracking'); else { setAuthIntent('openTracking'); setAuthOpen(true); } }}
        onProfileOpen={() => { if(user) setActiveCategory('profile'); else { setAuthIntent('openProfile'); setAuthOpen(true); } }}
        searchQuery={searchQuery}
        onSearchChange={(q)=>{ setSearchQuery(q); if(q && activeCategory==='home'){ setActiveCategory('skincare'); setSelectedBrand(null); } }}
        onHomeClick={() => { setActiveCategory('home'); setSelectedBrand(null); setSearchQuery(''); }}
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
      />

      <div className="flex-1 flex max-w-7xl mx-auto w-full relative z-30 pointer-events-auto">
        <Sidebar activeCategory={activeCategory} onSelect={handleCategorySelect} />

        <main className="flex-1 min-w-0 px-2 sm:px-4">
          {searchQuery && String(searchQuery).trim() !== '' ? (
            <SearchResults results={searchResults} onAddToCart={handleAddToCart} onQuickView={(product: Product) => setQuickViewProduct(product)} onWishlist={handleWishlist} wishlist={wishlist} />
          ) : activeCategory === 'home' ? (
            <Homepage onCategorySelect={handleCategorySelect} onBrandSelect={handleBrandSelect} onAddToCart={handleAddToCart} onQuickView={(product: Product) => setQuickViewProduct(product)} onWishlist={handleWishlist} wishlist={wishlist} />
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
            <CategoryView categoryId={activeCategory} initialBrand={selectedBrand} searchQuery={searchQuery} allProducts={products} onAddToCart={handleAddToCart} onQuickView={(product: Product) => setQuickViewProduct(product)} onWishlist={handleWishlist} wishlist={wishlist} />
          )}
        </main>
      </div>

      <BottomNav activeCategory={activeCategory} onSelect={handleCategorySelect} />

      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cartItems={cartItems}
        onUpdateQty={handleUpdateQty}
        onRemove={handleRemoveFromCart}
        onCheckout={() => {
          if(user){ setInlineCheckoutOpen(true); } else { setAuthIntent('checkout'); setAuthOpen(true); }
        }}
      />

      {quickViewProduct && (
        <QuickViewModal product={quickViewProduct} onClose={()=>setQuickViewProduct(null)} onAddToCart={handleAddToCart} onWishlist={handleWishlist} isWishlisted={wishlist.some((w: Product) => w.id === quickViewProduct.id)} />
      )}

      {cartOpen && inlineCheckoutOpen && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-[440px] bg-white z-[60] flex flex-col shadow-2xl transition-transform">
          <div className="flex items-center justify-between px-6 py-5 border-b border-brand-gold-border/40 bg-brand-cream/60">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-black text-brand-gold flex items-center justify-center" />
              <div>
                <h2 className="font-serif-luxury text-2xl font-bold text-brand-black">Checkout</h2>
                <p className="text-xs text-stone-500">Complete your order</p>
              </div>
            </div>
            <button onClick={()=>setInlineCheckoutOpen(false)} className="px-3 py-2">Close</button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <InlineCheckoutForm user={user} cartItems={cartItems} subtotal={cartItems.reduce((s: number, i: CartItem) => s + i.price * i.qty, 0)} onCancel={()=>setInlineCheckoutOpen(false)} onConfirm={(order: OrderInput)=>{ handlePlaceOrder(order); }} />
          </div>
        </div>
      )}

      {/* Profile and Wishlist are now dedicated full-page views handled by `activeCategory` */}

      <AuthModal open={authOpen} onClose={()=>{ setAuthOpen(false); setAuthIntent(null); }} onSuccess={(u)=>{ setAuthOpen(false); if(authIntent === 'openCart'){ setCartOpen(true); } else if(authIntent === 'checkout'){ setCartOpen(true); setTimeout(()=>setInlineCheckoutOpen(true), 150); } else if(authIntent === 'openTracking'){ setActiveCategory('tracking'); } else if(authIntent === 'openProfile'){ setActiveCategory('profile'); } setAuthIntent(null); }} />

      <ChatWidget products={products} />
      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
