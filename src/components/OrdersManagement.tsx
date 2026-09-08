import React from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';

export default function OrdersManagement(){
  const { orders, actions } = useData();
  const { user } = useAuth();

  if(!user || user.role !== 'admin') return <div className="p-6">Access denied.</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Orders Management</h2>
      {orders.length===0 ? (
        <div className="text-sm text-stone-500">No orders yet.</div>
      ) : (
        <div className="space-y-4">
          {orders
            .slice()
            .sort((a, b) => {
              const ta = a.createdAt ? new Date(a.createdAt).getTime() : a.id || 0;
              const tb = b.createdAt ? new Date(b.createdAt).getTime() : b.id || 0;
              // descending: newest first
              return tb - ta;
            })
            .map(order=> (
            <div key={order.id} className="border rounded-lg p-4 bg-white shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-semibold">Order #{order.id}</div>
                  <div className="text-xs text-stone-400">Placed: {new Date(order.createdAt).toLocaleString()}</div>
                </div>
                <div className="text-sm">Status: <strong className="capitalize">{order.status}</strong></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-stone-500">Customer</div>
                  <div className="font-semibold">{order.name}</div>
                  <div className="text-sm">{order.phone}</div>
                  <div className="text-sm">{order.governorate} - {order.address}</div>
                </div>
                <div>
                  <div className="text-xs text-stone-500">Items</div>
                  <ul className="text-sm list-disc list-inside">
                    {order.items.map(it=> (
                      <li key={it.id}>{it.name} x{it.qty} — ${it.price.toFixed(2)}</li>
                    ))}
                  </ul>
                  <div className="mt-2 text-sm font-bold">Total: ${order.total.toFixed(2)}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-500 mr-2">Set Status:</span>
                  <button onClick={()=>actions.updateOrder(order.id,{status:'confirmed'})} className={`px-3 py-1 rounded ${order.status==='confirmed'?'bg-brand-gold text-black':'bg-stone-100'}`}>Confirmed</button>
                  <button onClick={()=>actions.updateOrder(order.id,{status:'preparing'})} className={`px-3 py-1 rounded ${order.status==='preparing'?'bg-brand-gold text-black':'bg-stone-100'}`}>Preparing</button>
                  <button onClick={()=>actions.updateOrder(order.id,{status:'shipped'})} className={`px-3 py-1 rounded ${order.status==='shipped'?'bg-brand-gold text-black':'bg-stone-100'}`}>Shipped</button>
                  <button onClick={()=>actions.updateOrder(order.id,{status:'delivered'})} className={`px-3 py-1 rounded ${order.status==='delivered'?'bg-brand-gold text-black':'bg-stone-100'}`}>Delivered</button>
                </div>
                <div className="ml-auto flex gap-2">
                  <button onClick={()=>actions.deleteOrder(order.id)} className="px-3 py-1 bg-stone-200 rounded">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
