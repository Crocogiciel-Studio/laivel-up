import type { ReactNode } from 'react';

/** Stand-in until the real editor lands. */
export function Placeholder({ title, issue, blurb }: {
  title: string;
  issue: string;
  blurb: string;
}): ReactNode {
  return (
    <section className="page">
      <h1>{title}</h1>
      <p className="muted">{blurb}</p>
      <p className="muted small">
        Coming in <a href={`https://github.com/Crocogiciel-Studio/laivel-up/issues/${issue}`}>#{issue}</a>.
      </p>
    </section>
  );
}
