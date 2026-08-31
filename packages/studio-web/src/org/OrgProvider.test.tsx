import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
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
const SESSION = { user: { id: 'u1' } };
vi.mock('../auth/AuthProvider.js', () => ({ useAuth: () => ({ session: SESSION }) }));

const { OrgProvider, useOrg } = await import('./OrgProvider.js');

afterEach(() => {
  apiMock.mockReset();
  localStorage.clear();
});

function Probe(): ReactNode {
  const { orgs, currentOrg, error } = useOrg();
  return (
    <div>
      <span data-testid="count">{orgs === undefined ? 'loading' : orgs.length}</span>
      <span data-testid="current">{currentOrg?.name ?? '-'}</span>
      <span data-testid="error">{error ?? '-'}</span>
    </div>
  );
}

describe('OrgProvider', () => {
  it('loads orgs and picks the first', async () => {
    apiMock.mockResolvedValueOnce([{ id: 'o1', name: 'Acme', createdAt: '' }]);
    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(screen.getByTestId('current').textContent).toBe('Acme');
    expect(apiMock).toHaveBeenCalledWith('/api/orgs');
  });

  it('surfaces an error instead of spinning when /api/orgs fails', async () => {
    apiMock.mockRejectedValue(new MockApiError(500, 'boom'));
    render(
      <OrgProvider>
        <Probe />
      </OrgProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('boom'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });
});
