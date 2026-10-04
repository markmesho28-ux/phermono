import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Header from './Header';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { DEFAULT_PROMO_BANNER, fetchPromoBannerConfig, savePromoBannerContent } from '../utils/promoBanner';
import initFastTouch from '../utils/fastTouch';

jest.mock('../contexts/AuthContext');
jest.mock('../contexts/DataContext');
jest.mock('../utils/promoBanner', () => ({
  DEFAULT_PROMO_BANNER: {
    bannerId: 'banner-1',
    products: [
      { id: undefined, image: '', alt: 'Left', enabled: false },
      { id: 'middle-id', image: '', alt: 'Middle', enabled: false },
      { id: undefined, image: '', alt: 'Right', enabled: false },
    ],
    content: {
      campaignLabel: 'WINTER SALE',
      headline: 'Up to 60% off curated essentials',
      badge: 'LIMITED TIME',
    },
    cta: { enabled: false, text: '', url: '' },
  },
  fetchPromoBannerConfig: jest.fn(),
  savePromoBannerContent: jest.fn(),
}));

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
    (useData as jest.Mock).mockReturnValue({
      siteSettings: { promo_banner_text: 'Up to 60% off curated essentials' },
      updateSiteSettings: jest.fn().mockResolvedValue(undefined),
    });
    (fetchPromoBannerConfig as jest.Mock).mockResolvedValue(DEFAULT_PROMO_BANNER);
    (savePromoBannerContent as jest.Mock).mockResolvedValue(DEFAULT_PROMO_BANNER);
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

  it('keeps the native click path on header action taps without preventing the browser click event', () => {
    render(<Header {...defaultProps} />);

    const observed: boolean[] = [];
    document.addEventListener('click', (event) => {
      observed.push(event.defaultPrevented);
    }, { capture: true });

    fireEvent.click(screen.getByLabelText('Favorite List'));
    fireEvent.click(screen.getByLabelText('Bag'));
    fireEvent.click(screen.getByLabelText('Track Orders'));
    fireEvent.click(screen.getByLabelText('Your Assistant'));

    expect(observed).toEqual([false, false, false, false]);
    expect(defaultProps.onWishlistOpen).toHaveBeenCalledTimes(1);
    expect(defaultProps.onCartOpen).toHaveBeenCalledTimes(1);
    expect(defaultProps.onTrackOpen).toHaveBeenCalledWith(true);
    expect(defaultProps.onAssistantOpen).toHaveBeenCalledTimes(1);
  });

  it('opens the auth modal from the click event without opening on pointer down', () => {
    const onAuthOpen = jest.fn();
    render(<Header {...defaultProps} onAuthOpen={onAuthOpen} />);

    const signInButton = screen.getByRole('button', { name: 'Sign in' });
    fireEvent.pointerDown(signInButton);
    expect(onAuthOpen).not.toHaveBeenCalled();

    fireEvent.click(signInButton);

    expect(onAuthOpen).toHaveBeenCalledTimes(1);
    expect(onAuthOpen).toHaveBeenCalledWith(true);
  });

  it('opens the mobile menu via the native click path without synthetic touch interception', () => {
    render(<Header {...defaultProps} />);
    const menuBtn = screen.getByLabelText('Open categories menu');

    fireEvent.click(menuBtn);

    expect(defaultProps.onMenuToggle).toHaveBeenCalledTimes(1);
    expect(defaultProps.onMenuToggle).toHaveBeenCalledWith(true);
  });

  it('keeps the banner editor open until the banner database save resolves', async () => {
    const updateSiteSettings = jest.fn().mockResolvedValue(undefined);
    let resolveBannerSave: ((value: any) => void) | null = null;

    (useData as jest.Mock).mockReturnValue({
      siteSettings: { promo_banner_text: 'Up to 60% off curated essentials' },
      updateSiteSettings,
    });
    (savePromoBannerContent as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveBannerSave = resolve; })
    );

    (useAuth as jest.Mock).mockReturnValue({
      user: { role: 'admin' },
      logout: jest.fn(),
    });

    render(<Header {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Edit promotional text'));
    fireEvent.change(screen.getByLabelText('Edit promotional announcement text'), {
      target: { value: 'New flagship drop' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByLabelText('Edit promotional announcement text')).toBeInTheDocument();
    expect(savePromoBannerContent).toHaveBeenCalledTimes(1);

    resolveBannerSave?.({
      ...DEFAULT_PROMO_BANNER,
      content: { ...DEFAULT_PROMO_BANNER.content, headline: 'New flagship drop' },
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Edit promotional announcement text')).not.toBeInTheDocument();
    });
  });

  it('keeps the native tap behavior for black buttons without synthetic touch interception', () => {
    const onClick = jest.fn();
    const destroy = initFastTouch();

    render(
      <button type="button" className="bg-brand-black touch-target" onClick={onClick}>
        Buy now
      </button>
    );

    const button = screen.getByRole('button', { name: 'Buy now' });

    fireEvent.touchStart(button);
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    destroy();
  });
});
