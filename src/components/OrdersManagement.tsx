import React from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { formatOrderDate, getOrderTimestamp } from '../utils/orderDate';

export default function OrdersManagement(){
  const { orders, actions } = useData();
  const { user } = useAuth();

  if(!user || user.role !== 'admin') return <div className="p-6">Access denied.</div>;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      <h2 className="text-xl sm:text-2xl font-bold mb-4">Orders Management</h2>
      {orders.length===0 ? (
        <div className="text-sm text-stone-500">No orders yet.</div>
      ) : (
        <div className="space-y-4">
          {orders
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
                  <div className="text-sm font-semibold">Order #{order.id}</div>
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
    </div>
  );
}
