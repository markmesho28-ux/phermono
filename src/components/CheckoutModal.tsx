import React, { useState, useEffect } from 'react';
import { getShippingCost } from '../utils/shipping';
import AdminModal from './AdminModal';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import type { CartItem, OrderInput } from '../types';

const GOVERNORATES = ['أسوان','أسيوط'];

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  subtotal: number;
  onConfirm?: (order: OrderInput) => void;
}

export default function CheckoutModal({ open, onClose, cartItems, subtotal, onConfirm }: CheckoutModalProps){
  const { user } = useAuth();
  const { actions } = useData();
  const [form, setForm] = useState<{ name: string; phone: string; governorate: string; address: string }>({ name: '', phone: '', governorate: '', address: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(()=>{
    if(user){
      setForm(f => ({ ...f, name: user.name || '', phone: user.phone || '' }));
    }
  },[user, open]);

  const validate = () => {
    const e: Record<string, string> = {};
    if(!form.name || String(form.name).trim()==='') e.name = 'Required';
    if(!form.phone || String(form.phone).trim()==='') e.phone = 'Required';
    if(!form.governorate) e.governorate = 'Required';
    if(!form.address || String(form.address).trim()==='') e.address = 'Required';
    setErrors(e);
    return Object.keys(e).length===0;
  };

  const submit = ()=>{
    if(!validate()) return;
    const shipping = (getShippingCost && typeof getShippingCost === 'function') ? getShippingCost(form.governorate) : 50;
    const total = +(subtotal + shipping).toFixed(2);
    const order: OrderInput = { name: form.name.trim(), phone: form.phone.trim(), governorate: form.governorate, address: form.address.trim(), items: cartItems.map(i=>({ id: i.id, name: i.name, qty: i.qty, price: i.price })), total, shipping, status: 'pending' };
    actions.addOrder(order);
    if(onConfirm) onConfirm(order);
    onClose();
  };

  return (
    <AdminModal open={open} title="Checkout" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold">Name</label>
          <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full p-2 border rounded" />
          {errors.name && <div className="text-xs text-red-500">{errors.name}</div>}
        </div>
        <div>
          <label className="text-xs font-semibold">Phone</label>
          <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="w-full p-2 border rounded" />
          {errors.phone && <div className="text-xs text-red-500">{errors.phone}</div>}
        </div>
        <div>
          <label className="text-xs font-semibold">Governorate</label>
          <select value={form.governorate} onChange={e=>setForm({...form,governorate:e.target.value})} className="w-full p-2 border rounded">
            <option value="">Select governorate</option>
            {GOVERNORATES.map(g=> <option key={g} value={g}>{g}</option>)}
          </select>
          {errors.governorate && <div className="text-xs text-red-500">{errors.governorate}</div>}
        </div>
        <div>
          <label className="text-xs font-semibold">Address</label>
          <textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})} className="w-full p-2 border rounded" />
          {errors.address && <div className="text-xs text-red-500">{errors.address}</div>}
        </div>
        {/* Order Summary */}
        <div className="bg-stone-50 p-3 rounded">
          <div className="flex justify-between text-sm text-stone-600"><span>Subtotal</span><span>EGP {subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm text-stone-600"><span>Shipping</span><span>EGP {getShippingCost(form.governorate).toFixed(2)}</span></div>
          <div className="flex justify-between text-base font-bold text-brand-black mt-2"><span>Total</span><span>EGP {(subtotal + getShippingCost(form.governorate)).toFixed(2)}</span></div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded touch-target">Cancel</button>
          <button onClick={submit} className="px-3 py-2 bg-black text-white rounded touch-target">Place Order</button>
        </div>
      </div>
    </AdminModal>
  );
}
