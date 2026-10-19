import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Tabs, TabPanel } from '../components/ui/Tabs';
import { OverflowMenu } from '../components/ui/OverflowMenu';
import { IconButton } from '../components/ui/IconButton';
import { PageHeader } from '../components/ui/PageHeader';

const ITEMS = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta', badge: 3 },
  { id: 'c', label: 'Gamma' },
];

function TabsHarness() {
  const [v, setV] = useState('a');
  return (
    <>
      <Tabs items={ITEMS} value={v} onChange={setV} label="Sections" idPrefix="t" />
      {ITEMS.map((i) => (
        <TabPanel key={i.id} idPrefix="t" id={i.id} active={v === i.id}>
          panel-{i.id}
        </TabPanel>
      ))}
    </>
  );
}

describe('Tabs', () => {
  it('exposes tablist/tab/tabpanel semantics with a single tab stop', () => {
    render(<TabsHarness />);
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('t-tab-a');
    expect(screen.getByText('panel-a')).toBeTruthy();
  });

  it('moves with Arrow/Home/End keys and wraps', () => {
    render(<TabsHarness />);
    const [a, b, c] = screen.getAllByRole('tab');
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(b.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b, { key: 'End' });
    expect(c.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(c, { key: 'ArrowRight' });
    expect(a.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(a, { key: 'ArrowLeft' });
    expect(c.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(c, { key: 'Home' });
    expect(a.getAttribute('aria-selected')).toBe('true');
  });

  it('renders badges and only the active panel body', () => {
    render(<TabsHarness />);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.queryByText('panel-b')).toBeNull();
  });
});

describe('OverflowMenu', () => {
  it('opens, runs an item and closes; Esc closes and refocuses the trigger', () => {
    const del = vi.fn();
    render(<OverflowMenu label="More actions" items={[{ label: 'Rename', onSelect: vi.fn() }, { label: 'Delete', onSelect: del, danger: true }]} />);
    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(del).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not run disabled items and arrow keys cycle enabled items', () => {
    const off = vi.fn();
    render(<OverflowMenu label="More" items={[{ label: 'One', onSelect: vi.fn() }, { label: 'Off', onSelect: off, disabled: true }, { label: 'Two', onSelect: vi.fn() }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const one = screen.getByRole('menuitem', { name: 'One' });
    const two = screen.getByRole('menuitem', { name: 'Two' });
    expect(document.activeElement).toBe(one);
    fireEvent.keyDown(one, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(two);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Off' }));
    expect(off).not.toHaveBeenCalled();
  });
});

describe('IconButton and PageHeader', () => {
  it('IconButton is named, typed button and at least 36px class', () => {
    render(<IconButton label="Refresh">x</IconButton>);
    const b = screen.getByRole('button', { name: 'Refresh' });
    expect(b.getAttribute('type')).toBe('button');
    expect(b.className).toContain('h-9');
  });

  it('PageHeader renders one h1, description and actions', () => {
    render(<PageHeader title="Jobs" description="Find roles" primaryAction={<button>Go</button>} actions={<button>More</button>} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Find roles')).toBeTruthy();
    expect(screen.getByText('Go')).toBeTruthy();
    expect(screen.getByText('More')).toBeTruthy();
  });
});
