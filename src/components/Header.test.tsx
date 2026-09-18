import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from './Header';
import { useAuth } from '../contexts/AuthContext';

jest.mock('../contexts/AuthContext');

describe('Header Action Buttons', () => {
  const defaultProps = {
    cartCount: 3,
    wishlistCount: 2,
    onCartOpen: jest.fn(),
    onTrackOpen: jest.fn(),
    onAssistantOpen: jest.fn(),
    onWishlistOpen: jest.fn(),
    searchQuery: '',
    onSearchChange: jest.fn(),
    onHomeClick: jest.fn(),
    onMenuToggle: jest.fn(),
  };

  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      logout: jest.fn(),
    });
    jest.clearAllMocks();
  });

  it('renders all four action buttons properly', () => {
    render(<Header {...defaultProps} />);

    expect(screen.getByLabelText('Favorite List')).toBeInTheDocument();
    expect(screen.getByLabelText('Bag')).toBeInTheDocument();
    expect(screen.getByLabelText('Track Orders')).toBeInTheDocument();
    expect(screen.getByLabelText('Your Assistant')).toBeInTheDocument();
  });

  it('displays the cart count badge correctly', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('triggers onWishlistOpen when Favorites button is clicked', () => {
    render(<Header {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Favorite List'));
    expect(defaultProps.onWishlistOpen).toHaveBeenCalledTimes(1);
  });

  it('triggers onCartOpen when Bag button is clicked', () => {
    render(<Header {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Bag'));
    expect(defaultProps.onCartOpen).toHaveBeenCalledTimes(1);
  });

  it('triggers onTrackOpen when Tracking button is clicked', () => {
    render(<Header {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Track Orders'));
    expect(defaultProps.onTrackOpen).toHaveBeenCalledWith(true);
  });

  it('triggers onAssistantOpen when Your Assistant button is clicked', () => {
    render(<Header {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Your Assistant'));
    expect(defaultProps.onAssistantOpen).toHaveBeenCalledTimes(1);
  });

  it('triggers onMenuToggle when mobile menu button is tapped/clicked', () => {
    render(<Header {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Open categories menu'));
    expect(defaultProps.onMenuToggle).toHaveBeenCalledTimes(1);
  });

  it('triggers onMenuToggle on touchStart and suppresses subsequent ghost click', () => {
    render(<Header {...defaultProps} />);
    const menuBtn = screen.getByLabelText('Open categories menu');

    // 1. Initial touch on mobile
    fireEvent.touchStart(menuBtn);
    expect(defaultProps.onMenuToggle).toHaveBeenCalledTimes(1);

    // 2. Synthetic delayed ghost click dispatched by browser ~300ms after touch
    fireEvent.click(menuBtn);
    // Should still be called only 1 time (ghost click ignored)
    expect(defaultProps.onMenuToggle).toHaveBeenCalledTimes(1);
  });
});
