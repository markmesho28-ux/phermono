import React from 'react';
import { Edit2, X } from 'lucide-react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { checkIsAdminRole } from '../utils/admin';
import { formatOrderDate, getOrderDisplayId, getOrderTimestamp } from '../utils/orderDate';
import type { Order, OrderItem, Product } from '../types';

export default function OrdersManagement(){
  const { orders, products, actions } = useData();
  const { user } = useAuth();
  const [orderSearch, setOrderSearch] = React.useState('');
  const [editingOrder, setEditingOrder] = React.useState<Order | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editPhone, setEditPhone] = React.useState('');
  const [editGovernorate, setEditGovernorate] = React.useState('');
  const [editAddress, setEditAddress] = React.useState('');
  const [editItems, setEditItems] = React.useState<OrderItem[]>([]);
  const [productSearch, setProductSearch] = React.useState('');
  const [showProductResults, setShowProductResults] = React.useState(false);
  const isAdmin = Boolean(user && checkIsAdminRole(user));
  const normalizedOrderSearch = orderSearch.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const filteredOrders = orders.filter((order) => {
    if (!normalizedOrderSearch) return true;
    return String(order.id).toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalizedOrderSearch);
  });

  const openEditOrder = (order: Order) => {
    setEditingOrder(order);
    setEditName(order.name || '');
    setEditPhone(order.phone || '');
    setEditGovernorate(order.governorate || '');
    setEditAddress(order.address || '');
    setEditItems((order.items || []).map((item) => ({ ...item })));
    setProductSearch('');
    setShowProductResults(false);
  };

  const updateEditItemQuantity = (itemId: number | string, quantity: number) => {
    setEditItems((items) => items
      .map((item) => item.id === itemId ? { ...item, qty: quantity } : item)
      .filter((item) => item.qty > 0));
  };

  const addProductToOrder = (product: Product) => {
    setEditItems((items) => {
      const existing = items.find((item) => String(item.id) === String(product.id));
      if (existing) {
        return items.map((item) => item.id === existing.id ? { ...item, qty: item.qty + 1 } : item);
      }

      const price = Number(product.sellingPrice ?? product.price ?? 0);
      return [...items, {
        id: product.id,
        name: product.name,
        qty: 1,
        price,
        unit_price: price,
        total_price: price,
      }];
    });
    setProductSearch('');
    setShowProductResults(false);
  };

  const matchingProducts = products.filter((product) => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return true;
    return `${product.name} ${product.brand}`.toLowerCase().includes(query);
  }).slice(0, 8);

  const saveEditedOrder = () => {
    if (!editingOrder) return;

    const normalizedItems = editItems.map((item) => {
      const price = Number(item.unit_price ?? item.price ?? 0);
      return {
        ...item,
        qty: Math.max(1, Number(item.qty) || 1),
        price,
        unit_price: price,
        total_price: +(price * Math.max(1, Number(item.qty) || 1)).toFixed(2),
      };
    });
    const itemsTotal = normalizedItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
    const shipping = Number(editingOrder.shipping || 0);

    actions.updateOrder(editingOrder.id, {
      name: editName.trim(),
      phone: editPhone.trim(),
      governorate: editGovernorate,
      address: editAddress.trim(),
      items: normalizedItems,
      total: +(itemsTotal + shipping).toFixed(2),
    });
    setEditingOrder(null);
  };

  if(!isAdmin) return <div className="p-6">Access denied.</div>;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      <h2 className="text-xl sm:text-2xl font-bold mb-4">Orders Management</h2>
      <input
        type="search"
        value={orderSearch}
        onChange={(event) => setOrderSearch(event.target.value)}
        placeholder="Search by order number"
        aria-label="Search orders by order number"
        className="mb-4 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30"
      />
      {filteredOrders.length===0 ? (
        <div className="text-sm text-stone-500">{orderSearch.trim() ? 'No matching orders.' : 'No orders yet.'}</div>
      ) : (
        <div className="space-y-4">
          {filteredOrders
            .slice()
            .sort((a, b) => {
              const ta = getOrderTimestamp(a);
              const tb = getOrderTimestamp(b);
              return tb - ta;
            })
            .map(order => (
            <div key={order.id} className="border rounded-lg p-3 sm:p-4 bg-white shadow-sm">

              {/* Order header — stacks on mobile, side-by-side on sm+ */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
                <div>
                  <div className="text-sm font-semibold">Order #{getOrderDisplayId(order.id)}</div>
                  <div className="text-xs text-stone-400">Placed: {formatOrderDate(order)}</div>
                </div>
                <div className="inline-flex items-center gap-1.5 text-xs sm:text-sm">
                  <span className="text-stone-400">Status:</span>
                  <span className="font-bold capitalize px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">{order.status}</span>
                </div>
              </div>

              {/* Customer + Items — 1 col on mobile, 2 cols on sm+ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <div className="text-xs text-stone-500 mb-0.5">Customer</div>
                  <div className="font-semibold text-sm">{order.name}</div>
                  <div className="text-sm text-stone-600">{order.phone}</div>
                  <div className="text-sm text-stone-600">{order.governorate} — {order.address}</div>
                </div>
                <div>
                  <div className="text-xs text-stone-500 mb-0.5">Items</div>
                  <ul className="text-sm list-disc list-inside space-y-0.5">
                    {(order.items || []).map(it => (
                      <li key={it.id} className="break-words">{it.name} ×{it.qty} — EGP {(Number(it?.price) || 0).toFixed(2)}</li>
                    ))}
                  </ul>
                  <div className="mt-2 text-sm font-bold">Total: EGP {(Number(order?.total) || 0).toFixed(2)}</div>
                </div>
              </div>

              {/* Actions — status buttons wrap on mobile, Delete below on mobile */}
              <div className="mt-3 pt-3 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex flex-col xs:flex-row flex-wrap items-start xs:items-center gap-2">
                  <span className="text-xs text-stone-500 whitespace-nowrap">Set Status:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(['confirmed', 'preparing', 'shipped', 'delivered'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => actions.updateOrder(order.id, { status: s })}
                        className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors touch-target ${
                          order.status === s
                            ? 'bg-brand-gold text-black shadow-sm'
                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                        }`}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openEditOrder(order)}
                  className="inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium text-brand-black transition-colors hover:bg-brand-gold/20 touch-target"
                >
                  <Edit2 size={13} /> Edit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await actions.deleteOrder(order.id);
                    } catch (err) {
                      console.error('OrdersManagement: Error while deleting order:', err);
                    }
                  }}
                  className="sm:ml-auto px-3 py-1 bg-stone-200 hover:bg-red-100 hover:text-red-600 rounded text-xs font-medium transition-colors self-start sm:self-auto touch-target"
                >
                  Delete
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {editingOrder && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditingOrder(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Edit order"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Order #{getOrderDisplayId(editingOrder.id)}</h3>
              <button type="button" onClick={() => setEditingOrder(null)} aria-label="Close edit order" className="rounded-full p-2 text-stone-500 hover:bg-stone-100">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Customer name" className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
              <input value={editPhone} onChange={(event) => setEditPhone(event.target.value)} placeholder="Phone" className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
              <input value={editGovernorate} onChange={(event) => setEditGovernorate(event.target.value)} placeholder="Governorate" className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm" />
              <input value={editAddress} onChange={(event) => setEditAddress(event.target.value)} placeholder="Address" className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm sm:col-span-2" />
            </div>

            <div className="mt-5 space-y-2">
              <h4 className="text-sm font-bold">Items</h4>
              {editItems.map((item) => (
                <div key={String(item.id)} className="flex items-center gap-2 rounded-xl border border-stone-200 p-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                  <div className="inline-flex items-center rounded-xl border border-stone-200 bg-white">
                    <button
                      type="button"
                      onClick={() => updateEditItemQuantity(item.id, item.qty - 1)}
                      aria-label={`Decrease quantity for ${item.name}`}
                      className="flex h-9 w-9 items-center justify-center text-lg font-semibold text-stone-600 transition-colors hover:bg-stone-100"
                    >
                      -
                    </button>
                    <span className="flex h-9 min-w-8 items-center justify-center border-x border-stone-200 px-2 text-sm font-semibold text-brand-black">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateEditItemQuantity(item.id, item.qty + 1)}
                      aria-label={`Increase quantity for ${item.name}`}
                      className="flex h-9 w-9 items-center justify-center text-lg font-semibold text-stone-600 transition-colors hover:bg-stone-100"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
              <div className="relative pt-2">
                <input
                  type="search"
                  value={productSearch}
                  onChange={(event) => {
                    setProductSearch(event.target.value);
                    setShowProductResults(true);
                  }}
                  onFocus={() => setShowProductResults(true)}
                  placeholder="Search products to add..."
                  aria-label="Search products to add"
                  className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30"
                />
                {showProductResults && matchingProducts.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-lg">
                    {matchingProducts.map((product: Product) => (
                      <button
                        type="button"
                        key={product.id}
                        onClick={() => addProductToOrder(product)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-stone-100"
                      >
                        <span className="truncate">{product.name}</span>
                        <span className="ml-3 shrink-0 text-xs text-stone-500">{product.brand}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingOrder(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100">Cancel</button>
              <button type="button" onClick={saveEditedOrder} className="rounded-xl bg-brand-black px-4 py-2 text-sm font-semibold text-white hover:bg-brand-charcoal">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
