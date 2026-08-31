import { afterEach, describe, expect, it, vi } from 'vitest';

class MockApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
vi.mock('../api/client.js', () => ({ ApiError: MockApiError }));

const createRun = vi.fn();
vi.mock('./runApi.js', () => ({ createRun: (...a: unknown[]) => createRun(...a) }));

const { runBatch } = await import('./batch.js');

afterEach(() => createRun.mockReset());

describe('runBatch', () => {
  it('fires one createRun per profile against the shared grid, and reports each result', async () => {
    createRun
      .mockResolvedValueOnce({ subjectId: 'perceval' })
      .mockRejectedValueOnce(new MockApiError(422, 'bad grid'))
      .mockResolvedValueOnce({ subjectId: 'arthur' });

    const updates: unknown[] = [];
    const final = await runBatch(
      'o1',
      'g1',
      [
        { id: 'p1', name: 'Perceval' },
        { id: 'p2', name: 'Bohort' },
        { id: 'p3', name: 'Arthur' },
      ],
      (items) => updates.push(items),
    );

    expect(createRun).toHaveBeenCalledTimes(3);
    expect(createRun.mock.calls.map((c) => (c[0] as { profileId: string }).profileId)).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
    expect(createRun.mock.calls.every((c) => (c[0] as { gridId: string }).gridId === 'g1')).toBe(true);

    expect(final.map((f) => `${f.name}:${f.status}`)).toEqual([
      'Perceval:done',
      'Bohort:error',
      'Arthur:done',
    ]);
    expect(final[1]?.error).toBe('bad grid');
    expect(final[0]?.subjectId).toBe('perceval');
    // a progress update landed before the final array
    expect(updates.length).toBeGreaterThan(1);
  });
});
