import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';

describe('Sidebar Component', () => {
  it('renders primary navigation items', () => {
    const onTabChange = vi.fn();
    render(<Sidebar activeTab="dashboard" onTabChange={onTabChange} />);

    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.getByText('Auto-Apply')).toBeDefined();
    expect(screen.getByText('Live Console')).toBeDefined();
    expect(screen.getByText('Job Discovery')).toBeDefined();
    expect(screen.getByText('AI Matches')).toBeDefined();
  });

  it('triggers onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<Sidebar activeTab="dashboard" onTabChange={onTabChange} />);

    const autoApplyButton = screen.getByText('Auto-Apply');
    fireEvent.click(autoApplyButton);

    expect(onTabChange).toHaveBeenCalledWith('direct_apply');
  });
});
