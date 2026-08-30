import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase.js', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

const { App } = await import('./App.js');

describe('App', () => {
  it('routes an unauthenticated visitor to the login page', async () => {
    render(<App />);
    expect(await screen.findByText('LAIVEL UP studio')).toBeTruthy();
    expect(screen.getByText(/Continue with GitHub/)).toBeTruthy();
  });
});
