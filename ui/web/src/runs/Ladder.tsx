import type { ReactNode } from 'react';

interface Props {
  /** Ordered level labels, low to high (`ViewModel.scale`). */
  readonly scale: readonly string[];
  /** The label to mark as current, or null when no level was ruled. */
  readonly current: string | null;
}

/**
 * The grid's level scale as a horizontal ladder, with the ruled level marked.
 * Grid-agnostic: the position on the ladder carries the meaning, the emoji
 * rides along in the label. Renders nothing when the grid was unknown
 * (`scale` empty).
 */
export function Ladder({ scale, current }: Props): ReactNode {
  if (scale.length === 0) return null;
  const at = current === null ? -1 : scale.indexOf(current);

  return (
    <ol className="ladder" aria-label="level scale">
      {scale.map((label, i) => {
        const state = at < 0 ? 'none' : i < at ? 'below' : i === at ? 'here' : 'above';
        return (
          <li
            key={`${label}-${String(i)}`}
            className={`ladder-step ${state}`}
            aria-current={i === at ? 'step' : undefined}
          >
            <span className="ladder-dot" />
            <span className="ladder-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
