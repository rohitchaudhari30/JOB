import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccountSettings, passwordFormProblem } from '../pages/AccountSettings';
import { api } from '../services/api';

vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }));

describe('passwordFormProblem', () => {
  it('walks through every rule in order', () => {
    expect(passwordFormProblem('', 'x', 'x')).toMatch(/current/);
    expect(passwordFormProblem('old-pass-1', 'short', 'short')).toMatch(/at least 8/);
    expect(passwordFormProblem('same-pass-1', 'same-pass-1', 'same-pass-1')).toMatch(/different/);
    expect(passwordFormProblem('old-pass-1', 'new-pass-123', 'new-pass-124')).toMatch(/match/);
    expect(passwordFormProblem('old-pass-1', 'new-pass-123', 'new-pass-123')).toBeNull();
  });
});

describe('AccountSettings', () => {
  beforeEach(() => vi.restoreAllMocks());

  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('keeps Change password disabled until the form is valid, then hands the fresh token to the app', async () => {
    const changed = vi.fn();
    vi.spyOn(api, 'changePassword').mockResolvedValue({ access_token: 'fresh' });
    render(<AccountSettings onPasswordChanged={changed} onAccountDeleted={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Change password' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    type('Current password', 'old-pass-1');
    type('New password', 'new-pass-123');
    type('Repeat new password', 'new-pass-123');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(changed).toHaveBeenCalledWith('fresh'));
    expect(api.changePassword).toHaveBeenCalledWith('old-pass-1', 'new-pass-123');
  });

  it('deleting needs the password, then a confirmation, and only then calls the server', async () => {
    const deleted = vi.fn();
    const del = vi.spyOn(api, 'deleteAccount').mockResolvedValue();
    render(<AccountSettings onPasswordChanged={vi.fn()} onAccountDeleted={deleted} />);
    const open = screen.getByRole('button', { name: 'Delete my account' });
    expect((open as HTMLButtonElement).disabled).toBe(true);
    type('Your password', 'my-pass-123');
    fireEvent.click(open);
    expect(del).not.toHaveBeenCalled(); // the dialog comes first
    fireEvent.click(await screen.findByRole('button', { name: 'Delete everything' }));
    await waitFor(() => expect(deleted).toHaveBeenCalled());
    expect(del).toHaveBeenCalledWith('my-pass-123');
  });

  it('a wrong password on delete does not sign the user out', async () => {
    const deleted = vi.fn();
    vi.spyOn(api, 'deleteAccount').mockRejectedValue({ response: { data: { detail: 'Password is incorrect.' } } });
    render(<AccountSettings onPasswordChanged={vi.fn()} onAccountDeleted={deleted} />);
    type('Your password', 'wrong-pass-1');
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete everything' }));
    await waitFor(() => expect(api.deleteAccount).toHaveBeenCalled());
    expect(deleted).not.toHaveBeenCalled();
  });
});
