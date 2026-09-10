import React, { useState, useCallback } from "react";
import Header from "./components/Header";
import AuthModal from "./components/AuthModal";
import Sidebar from "./components/Sidebar";
import BottomNav from "./components/BottomNav";
import Homepage from "./components/Homepage";
import CategoryView from "./components/CategoryView";
import { CartDrawer, QuickViewModal } from "./components/CartDrawer";
import OrdersManagement from './components/OrdersManagement';
import AdminDashboard from './components/AdminDashboard';
import { useData } from "./contexts/DataContext";
import { useAuth } from "./contexts/AuthContext";
import { CheckCircle2 } from "lucide-react";
import ProductCard from "./components/ProductCard";
import ChatWidget from "./components/ChatWidget";
import type { CartItem, OrderInput, Product } from "./types";

function AssistantPage({ products }: { products: Product[] }) {
  return <ChatWidget products={products} mode="page" />;
}

interface ToastProps {
  message: string;
  visible: boolean;
}

// Simple toast used across the app
function Toast({ message, visible }: ToastProps) {
  return (
    <div
      className={`fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 bg-brand-black/95 text-white border border-brand-gold/40 px-6 py-3.5 rounded-full shadow-2xl text-xs sm:text-sm font-semibold tracking-wide backdrop-blur-md transition-all duration-500 max-md:whitespace-nowrap max-md:px-5 max-md:py-2.5 max-md:text-[11px] max-md:max-w-[90vw] ${
        visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-6 scale-95 pointer-events-none"
      }`}
    >
      <CheckCircle2 size={18} className="text-brand-gold shrink-0" />
      <span className="max-md:whitespace-nowrap">{message}</span>
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
                  <div className="text-xs text-stone-400">Placed: {new Date(order.createdAt).toLocaleString()}</div>
                </div>
                <div className="text-sm font-medium">Total: EGP {order.total.toFixed(2)}</div>
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

  

  

  

  

  const GOVERNORATES = ['أسوان','أسيوط'];

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
          <input id="profile-name" aria-label="Name" className="w-full p-2 text-sm bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
        </div>
        <div>
          <label htmlFor="profile-phone" className="text-sm font-semibold text-black">Phone</label>
          <input id="profile-phone" aria-label="Phone" className="w-full p-2 text-sm bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} />
        </div>
        <div>
          <label htmlFor="profile-governorate" className="text-sm font-semibold text-black">Governorate</label>
          <select id="profile-governorate" aria-label="Governorate" className="w-full p-2 text-sm bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={form.governorate} onChange={e=>setForm({...form,governorate:e.target.value})}>
            <option value="">Select governorate</option>
            {GOVERNORATES.map(g=> <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="profile-address" className="text-sm font-semibold text-black">Address</label>
          <textarea id="profile-address" aria-label="Address" className="w-full p-2 text-sm bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} />
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={saveProfile} disabled={saving} className="px-4 py-2 bg-black text-white rounded w-full sm:w-auto">{saving ? 'Saving...' : 'Save Profile'}</button>
        </div>

        <hr className="my-3" />

        <h3 className="text-lg font-semibold">Change Password</h3>
        {passError && <div className="text-sm text-red-700">{passError}</div>}
        <div className="mt-2 space-y-4">
          <div>
            <label htmlFor="current-password" className="text-sm font-semibold text-black">Current password</label>
            <input id="current-password" aria-label="Current password" type="password" className="w-full p-2 text-sm bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={passState.current} onChange={e=>setPassState(s=>({...s,current:e.target.value}))} />
          </div>
          <div>
            <label htmlFor="new-password" className="text-sm font-semibold text-black">New password</label>
            <input id="new-password" aria-label="New password" type="password" className="w-full p-2 text-sm bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={passState.next} onChange={e=>setPassState(s=>({...s,next:e.target.value}))} />
          </div>
          <div>
            <label htmlFor="confirm-password" className="text-sm font-semibold text-black">Confirm new password</label>
            <input id="confirm-password" aria-label="Confirm new password" type="password" className="w-full p-2 text-sm bg-white text-black border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-brand-gold" value={passState.confirm} onChange={e=>setPassState(s=>({...s,confirm:e.target.value}))} />
          </div>
          <div className="flex justify-end pb-6">
            <button onClick={changePass} className="px-4 py-2 bg-black text-white rounded w-full sm:w-auto">Update Password</button>
          </div>
        </div>

        {msg && <div className="text-sm text-green-600">{msg}</div>}
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
      />

      {activeCategory === 'assistant' ? (
        <AssistantPage products={products} />
      ) : (
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
            ) : activeCategory === 'admin' ? (
              <AdminDashboard />
            ) : (
              <CategoryView categoryId={activeCategory} initialBrand={selectedBrand} searchQuery={searchQuery} onAddToCart={handleAddToCart} onQuickView={(product: Product) => setQuickViewProduct(product)} onWishlist={handleWishlist} wishlist={wishlist} />
            )}
          </main>
        </div>
      )}

      <BottomNav
        activeCategory={activeCategory}
        onSelect={handleCategorySelect}
        isAdmin={!!(user && user.role === 'admin')}
        onAddCategory={() => setIsAddCategoryModalOpen(true)}
      />

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">إضافة فئة جديدة</h3>
            <label className="text-sm text-gray-600 mb-2 block">اسم الفئة</label>
            <input
              autoFocus
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="w-full px-3 py-2 mb-4 rounded-lg bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
              placeholder="مثال: المكياج"
            />

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setIsAddCategoryModalOpen(false); setNewCategoryName(''); }}
                className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
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
                className="px-4 py-2 rounded-lg bg-brand-gold text-black font-semibold hover:brightness-95"
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
