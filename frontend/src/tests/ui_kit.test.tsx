import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { Modal, Drawer } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { StatusChip } from '../components/ui/StatusChip';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit thing" footer={<button>Save</button>}>
        <input aria-label="name" />
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('is an accessible labelled dialog, moves focus in, traps Tab, closes on Esc and restores focus', () => {
    render(<Harness />);
    const trigger = screen.getByText('open');
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Edit thing' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const closeBtn = screen.getByLabelText('Close dialog');
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab from the first control wraps to the last (Save)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('Save'));
    // Tab from the last wraps to the first
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not dismiss while not dismissible', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Busy" dismissible={false}>x</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing when closed and supports the drawer variant', () => {
    const { rerender } = render(<Drawer open={false} onClose={() => {}} title="Detail">x</Drawer>);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<Drawer open onClose={() => {}} title="Detail">x</Drawer>);
    expect(screen.getByRole('dialog', { name: 'Detail' })).toBeDefined();
  });
});

describe('ConfirmDialog', () => {
  it('confirms and cancels', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Delete?" message="Gone forever" confirmLabel="Delete" destructive onConfirm={onConfirm} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByText('Delete'));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('Button / StatusChip', () => {
  it('disables and marks busy while loading', () => {
    render(<Button loading>Save</Button>);
    const b = screen.getByRole('button', { name: /save/i });
    expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(b.getAttribute('aria-busy')).toBe('true');
  });

  it('chip carries text and a non-colour mark', () => {
    const { container } = render(<StatusChip tone="danger">Failed</StatusChip>);
    expect(screen.getByText('Failed')).toBeDefined();
    expect(container.textContent).toContain('■');
  });
});
