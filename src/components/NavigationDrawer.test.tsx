import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from './Sidebar';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';

jest.mock('../contexts/DataContext');
jest.mock('../contexts/AuthContext');

const mockCategories = [
  { id: 'skincare', label: 'Skincare', icon: 'Sparkles', color: '', accent: '', subcategories: [] },
  { id: 'haircare', label: 'Haircare', icon: 'Wind', color: '', accent: '', subcategories: [] },
];

describe('Sidebar Mobile Drawer', () => {
  beforeEach(() => {
    (useData as jest.Mock).mockReturnValue({
      categories: mockCategories,
      actions: { deleteCategory: jest.fn(), addCategory: jest.fn(), updateCategory: jest.fn() },
    });
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
    });
  });

  it('renders mobile drawer with close button when mobileOpen is true', () => {
    const handleClose = jest.fn();
    render(
      <Sidebar
        activeCategory="home"
        onSelect={jest.fn()}
        mobileOpen={true}
        onClose={handleClose}
      />
    );

    const closeBtn = screen.getByLabelText('Close menu');
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders Home Overview button', () => {
    render(
      <Sidebar activeCategory="skincare" onSelect={jest.fn()} mobileOpen={true} />
    );
    expect(screen.getAllByText('Home Overview')[0]).toBeInTheDocument();
  });

  it('selects Home Overview and triggers onClose', () => {
    const handleClose = jest.fn();
    const handleSelect = jest.fn();
    render(
      <Sidebar
        activeCategory="skincare"
        onSelect={handleSelect}
        mobileOpen={true}
        onClose={handleClose}
      />
    );

    fireEvent.click(screen.getAllByText('Home Overview')[0]);
    expect(handleSelect).toHaveBeenCalledWith('home');
    expect(handleClose).toHaveBeenCalled();
  });

  it('renders Orders Management button and navigates on click', () => {
    const handleClose = jest.fn();
    const handleSelect = jest.fn();
    render(
      <Sidebar
        activeCategory="home"
        onSelect={handleSelect}
        mobileOpen={true}
        onClose={handleClose}
      />
    );

    // Orders Management should always be present regardless of role
    const ordersBtn = screen.getAllByText('Orders Management')[0];
    expect(ordersBtn).toBeInTheDocument();
    fireEvent.click(ordersBtn);
    expect(handleSelect).toHaveBeenCalledWith('orders');
    expect(handleClose).toHaveBeenCalled();
  });

  it('selects a department category and triggers onClose', () => {
    const handleClose = jest.fn();
    const handleSelect = jest.fn();
    render(
      <Sidebar
        activeCategory="home"
        onSelect={handleSelect}
        mobileOpen={true}
        onClose={handleClose}
      />
    );

    fireEvent.click(screen.getAllByText('Skincare')[0]);
    expect(handleSelect).toHaveBeenCalledWith('skincare');
    expect(handleClose).toHaveBeenCalled();
  });

  it('does NOT render Admin Dashboard button for any user', () => {
    // Admin Dashboard is removed from sidebar per design
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'admin1', name: 'Admin User', email: 'admin@example.com', role: 'admin' },
    });

    render(
      <Sidebar activeCategory="home" onSelect={jest.fn()} mobileOpen={true} />
    );

    expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument();
  });

  it('does NOT render Explore & Account links (they live in header)', () => {
    render(
      <Sidebar activeCategory="home" onSelect={jest.fn()} mobileOpen={true} />
    );

    expect(screen.queryByText('Favorite List')).not.toBeInTheDocument();
    expect(screen.queryByText('Order Tracking')).not.toBeInTheDocument();
    expect(screen.queryByText('Shopping Assistant')).not.toBeInTheDocument();
    expect(screen.queryByText('Sign In / Account')).not.toBeInTheDocument();
  });

  it('shows admin Add/Edit/Delete category controls for admin users', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'admin1', name: 'Admin User', email: 'admin@example.com', role: 'admin' },
    });

    render(
      <Sidebar activeCategory="home" onSelect={jest.fn()} mobileOpen={true} />
    );

    // Add Category button (PlusCircle) should be present
    expect(screen.getAllByTitle('Add Category').length).toBeGreaterThan(0);
    // Each category should have Edit and Delete buttons
    expect(screen.getAllByTitle('Edit').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Delete').length).toBeGreaterThan(0);
  });

  it('does not show admin category controls for regular users', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'u1', name: 'Regular User', email: 'user@example.com', role: 'customer' },
    });

    render(
      <Sidebar activeCategory="home" onSelect={jest.fn()} mobileOpen={true} />
    );

    expect(screen.queryByTitle('Add Category')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });
});

