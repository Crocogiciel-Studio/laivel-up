import { ApiError } from '../api/client.js';
import * as runApi from './runApi.js';

export type BatchStatus = 'pending' | 'running' | 'done' | 'error';

export interface BatchItem {
  readonly profileId: string;
  readonly name: string;
  readonly status: BatchStatus;
  readonly error?: string;
  readonly subjectId?: string;
}

/**
 * Score several profiles against one grid. Each run is an independent
 * `POST /api/runs` — they fire together and settle independently, so one
 * failure never blocks the rest. `onUpdate` gets a fresh array every time an
 * item changes, for a live progress list.
 */
export async function runBatch(
  orgId: string,
  gridId: string,
  profiles: readonly { readonly id: string; readonly name: string }[],
  onUpdate: (items: readonly BatchItem[]) => void,
): Promise<readonly BatchItem[]> {
  let items: BatchItem[] = profiles.map((p) => ({
    profileId: p.id,
    name: p.name,
    status: 'running',
  }));
  onUpdate(items);

  const settle = (profileId: string, next: Partial<BatchItem>): void => {
    items = items.map((it) => (it.profileId === profileId ? { ...it, ...next } : it));
    onUpdate(items);
  };

  await Promise.all(
    profiles.map((p) =>
      runApi
        .createRun({ orgId, gridId, profileId: p.id })
        .then((run) => settle(p.id, { status: 'done', subjectId: run.subjectId }))
        .catch((e: unknown) =>
          settle(p.id, {
            status: 'error',
            error: e instanceof ApiError ? e.message : 'run failed',
          }),
        ),
    ),
  );

  return items;
}
