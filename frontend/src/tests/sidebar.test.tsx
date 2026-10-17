import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';

describe('Sidebar Component', () => {
  it('renders primary navigation items', () => {
    const onTabChange = vi.fn();
    render(<Sidebar activeTab="dashboard" onTabChange={onTabChange} />);

    for (const label of ['Home', 'Jobs', 'Applications', 'Automation', 'Insights', 'Settings']) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(screen.getByRole('navigation', { name: 'Primary navigation' }).querySelectorAll('a').length).toBe(6);
  });

  it('highlights the owning section for sub-views', () => {
    render(<Sidebar activeTab="live_console" onTabChange={vi.fn()} />);
    expect(screen.getByText('Automation').closest('a')?.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Home').closest('a')?.getAttribute('aria-current')).toBeNull();
  });

  it('triggers onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<Sidebar activeTab="dashboard" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByText('Automation'));
    expect(onTabChange).toHaveBeenCalledWith('direct_apply');
    fireEvent.click(screen.getByText('Jobs'));
    expect(onTabChange).toHaveBeenCalledWith('discovery');
    fireEvent.click(screen.getByText('Settings'));
    expect(onTabChange).toHaveBeenCalledWith('profile');
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
    fireEvent.click(screen.getByText('Insights'));
    expect(onClose).toHaveBeenCalled();
  });
});
