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

  it('does not claim an active run when nothing is running', () => {
    render(<Sidebar activeTab="dashboard" onTabChange={vi.fn()} />);
    expect(screen.queryByText('Autopilot Active')).toBeNull();
    expect(screen.getByText('No active run')).toBeDefined();
  });

  it('reflects real run state', () => {
    const { rerender } = render(
      <Sidebar activeTab="dashboard" onTabChange={vi.fn()} stats={{ runStatus: 'RUNNING', isLiveRunning: true }} />
    );
    expect(screen.getByText('Run in progress')).toBeDefined();
    rerender(<Sidebar activeTab="dashboard" onTabChange={vi.fn()} stats={{ runStatus: 'PAUSED' }} />);
    expect(screen.getByText('Run paused')).toBeDefined();
  });

  it('marks the active item with aria-current and closes the drawer on navigation', () => {
    const onClose = vi.fn();
    render(<Sidebar activeTab="crm" onTabChange={vi.fn()} open onClose={onClose} />);
    expect(screen.getByText('Applications').closest('a')?.getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByText('Analytics'));
    expect(onClose).toHaveBeenCalled();
  });
});
