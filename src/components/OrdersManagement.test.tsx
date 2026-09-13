import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import OrdersManagement from './OrdersManagement';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';

jest.mock('../contexts/DataContext');
jest.mock('../contexts/AuthContext');

const mockOrders = [
  {
    id: 'order-123',
    name: 'Sarah Smith',
    phone: '01234567890',
    governorate: 'Cairo',
    address: '123 Main St',
    items: [{ id: 1, name: 'Serum', qty: 1, price: 250 }],
    total: 250,
    status: 'pending',
    createdAt: '2026-09-13T10:00:00.000Z',
  },
];

describe('OrdersManagement Component', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'admin1', name: 'Admin', role: 'admin' },
    });
  });

  it('renders order list and allows triggering deleteOrder', () => {
    const handleDeleteOrder = jest.fn();
    (useData as jest.Mock).mockReturnValue({
      orders: mockOrders,
      actions: {
        deleteOrder: handleDeleteOrder,
        updateOrder: jest.fn(),
      },
    });

    render(<OrdersManagement />);

    expect(screen.getByText('Orders Management')).toBeInTheDocument();
    expect(screen.getByText('Order #order-123')).toBeInTheDocument();
    expect(screen.getByText('Sarah Smith')).toBeInTheDocument();

    const deleteBtn = screen.getByText('Delete');
    fireEvent.click(deleteBtn);

    expect(handleDeleteOrder).toHaveBeenCalledWith('order-123');
  });

  it('renders access denied if user is not admin', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'user1', name: 'Customer', role: 'customer' },
    });
    (useData as jest.Mock).mockReturnValue({
      orders: mockOrders,
      actions: { deleteOrder: jest.fn() },
    });

    render(<OrdersManagement />);
    expect(screen.getByText('Access denied.')).toBeInTheDocument();
  });
});
