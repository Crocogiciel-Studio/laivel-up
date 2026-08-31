import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
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

const acceptMock = vi.fn();
vi.mock('../org/orgApi.js', () => ({ acceptInvite: (...a: unknown[]) => acceptMock(...a) }));
vi.mock('../api/client.js', () => ({ ApiError: MockApiError }));

const reload = vi.fn(() => Promise.resolve());
const select = vi.fn();
vi.mock('../org/OrgProvider.js', () => ({ useOrg: () => ({ reload, select }) }));

const { AcceptInvitePage } = await import('./AcceptInvitePage.js');

afterEach(() => {
  acceptMock.mockReset();
  reload.mockClear();
  select.mockClear();
});

function renderAt(token: string): void {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[`/invite/${token}`]}>
        <Routes>
          <Route path="/invite/:token" element={<AcceptInvitePage />} />
          <Route path="/" element={<div>home</div>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

describe('AcceptInvitePage', () => {
  it('accepts once even under StrictMode double-invoke, then confirms', async () => {
    acceptMock.mockResolvedValue({ orgId: 'o1', role: 'member' });
    renderAt('tok-123');
    await waitFor(() => expect(screen.getByText(/You're in/)).toBeTruthy());
    expect(acceptMock).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith('o1');
  });

  it('shows the error when the token is bad', async () => {
    acceptMock.mockRejectedValue(new MockApiError(400, 'invite already used'));
    renderAt('tok-x');
    await waitFor(() => expect(screen.getByText('invite already used')).toBeTruthy());
  });
});
