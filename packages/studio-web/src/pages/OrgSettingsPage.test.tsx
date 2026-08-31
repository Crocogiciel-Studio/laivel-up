import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
vi.mock('../api/client.js', () => ({
  api: (...a: unknown[]) => apiMock(...a),
  ApiError: class extends Error {},
}));

const authState = { id: 'admin-1' };
vi.mock('../auth/AuthProvider.js', () => ({
  useAuth: () => ({ session: { user: { id: authState.id } } }),
}));
vi.mock('../org/OrgProvider.js', () => ({
  useOrg: () => ({ currentOrg: { id: 'o1', name: 'Acme', createdAt: '' } }),
}));

const { OrgSettingsPage } = await import('./OrgSettingsPage.js');

const roster = [
  { userId: 'admin-1', email: 'a@x.test', role: 'admin', joinedAt: '' },
  { userId: 'mem-2', email: 'm@x.test', role: 'member', joinedAt: '' },
];

function routeApi(): void {
  apiMock.mockImplementation((path: string) => {
    if (path.endsWith('/members')) return Promise.resolve(roster);
    if (path.endsWith('/invites')) return Promise.resolve([]);
    return Promise.resolve(undefined);
  });
}

afterEach(() => {
  apiMock.mockReset();
  authState.id = 'admin-1';
});

describe('OrgSettingsPage', () => {
  it('shows the invite form to an admin', async () => {
    routeApi();
    render(<OrgSettingsPage />);
    await waitFor(() => expect(screen.getByText('a@x.test (you)')).toBeTruthy());
    expect(screen.getByText('Create invite')).toBeTruthy();
  });

  it('hides the invite form from a plain member', async () => {
    authState.id = 'mem-2';
    routeApi();
    render(<OrgSettingsPage />);
    await waitFor(() => expect(screen.getByText('m@x.test (you)')).toBeTruthy());
    expect(screen.queryByText('Create invite')).toBeNull();
  });
});
