import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import CategoryBar from './CategoryBar';

describe('CategoryBar', () => {
  const categories = [
    { id: 'skin', label: 'Skin', icon: 'Sparkles' as const, color: '#fff', accent: '#000', subcategories: [{ id: 'all', label: 'All' }], brands: [] },
    { id: 'hair', label: 'Hair', icon: 'Wind' as const, color: '#fff', accent: '#000', subcategories: [{ id: 'all', label: 'All' }], brands: [] },
    { id: 'body', label: 'Body', icon: 'Droplets' as const, color: '#fff', accent: '#000', subcategories: [{ id: 'all', label: 'All' }], brands: [] },
  ];

  it('does not queue a nested animation-frame reset when the loop snaps back to a valid index', () => {
    const rafSpy = jest.spyOn(window, 'requestAnimationFrame');
    const { container } = render(<CategoryBar categories={categories} />);

    fireEvent.click(screen.getByRole('button', { name: /next categories/i }));
    fireEvent.click(screen.getByRole('button', { name: /next categories/i }));

    const track = container.querySelector('div[style*="transform:"]') as HTMLDivElement | null;
    expect(track).not.toBeNull();

    fireEvent.transitionEnd(track!, { target: track!, currentTarget: track! });

    expect(rafSpy).not.toHaveBeenCalled();
    rafSpy.mockRestore();
  });
});
