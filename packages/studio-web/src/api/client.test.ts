import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'jwt-1' } } }) },
  },
}));

const { api, ApiError } = await import('./client.js');

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn(() =>
    Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      text: () => Promise.resolve(body === null ? '' : JSON.stringify(body)),
    } as Response),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('api client', () => {
  it('attaches the bearer token and parses JSON', async () => {
    const fetchFn = stubFetch(200, { ok: true });
    const out = await api<{ ok: boolean }>('/health');
    expect(out).toEqual({ ok: true });
    const headers = (fetchFn.mock.calls[0]?.[1] as RequestInit).headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer jwt-1');
  });

  it('returns undefined for 204', async () => {
    stubFetch(204, null);
    expect(await api('/api/grids/x', { method: 'DELETE' })).toBeUndefined();
  });

  it('throws ApiError with status and issues on a non-2xx', async () => {
    stubFetch(422, { error: 'bad', issues: ['x: required'] });
    await expect(api('/api/grids', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      status: 422,
      message: 'bad',
      issues: ['x: required'],
    });
    stubFetch(403, {});
    await expect(api('/api/grids')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws instead of silently resolving to null on a 2xx with a non-JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ status: 200, ok: true, text: () => Promise.resolve('<html>') } as Response),
      ),
    );
    await expect(api('/api/orgs')).rejects.toThrow();
  });
});
