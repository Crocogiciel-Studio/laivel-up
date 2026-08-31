import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

class MockApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
  }
}

const apiMock = vi.fn();
vi.mock('../api/client.js', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError: MockApiError,
}));

const signOut = vi.fn(() => Promise.resolve());
vi.mock('../auth/AuthProvider.js', () => ({
  useAuth: () => ({ session: { user: { id: 'u1', email: 'u1@studio.test' } }, signOut }),
}));
vi.mock('../org/OrgProvider.js', () => ({
  useOrg: () => ({ orgs: [{ id: 'o1', name: 'Acme', createdAt: '' }], currentOrg: { id: 'o1', name: 'Acme' }, error: null, select: vi.fn(), create: vi.fn() }),
}));

const { Shell } = await import('./Shell.js');

afterEach(() => {
  apiMock.mockReset();
  signOut.mockClear();
});

function renderShell(): void {
  render(
    <MemoryRouter initialEntries={['/profiles']}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/profiles" element={<div>profiles page</div>} />
        </Route>
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Shell — delete account', () => {
  it('does nothing if the confirm dialog is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    apiMock.mockResolvedValue({ ok: true }); // /health ping on mount
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(apiMock).toHaveBeenCalledTimes(1); // only the mount health check
    expect(apiMock).not.toHaveBeenCalledWith('/api/me', expect.anything());
  });

  it('deletes the account, signs out, and redirects to /login', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiMock.mockResolvedValueOnce({ ok: true }); // /health ping on mount
    apiMock.mockResolvedValueOnce(undefined); // DELETE /api/me
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    await waitFor(() => expect(screen.getByText('login page')).toBeTruthy());
    expect(apiMock).toHaveBeenCalledWith('/api/me', { method: 'DELETE' });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('shows the 409 message instead of navigating away', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    apiMock.mockResolvedValueOnce({ ok: true }); // /health ping on mount
    apiMock.mockRejectedValueOnce(new MockApiError(409, 'promote another admin (or leave) in Acme before deleting your account'));
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    await waitFor(() => expect(screen.getByText(/promote another admin/)).toBeTruthy());
    expect(screen.getByText('profiles page')).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
  });
});
