import { builtInEvaluators } from 'laivel-up/compose';

export interface CatalogueEntry {
  readonly id: string;
  /** Profile sections the criterion reads; absent ones make it return "unknown". */
  readonly needs: readonly string[];
}

/**
 * The coded criteria a grid can pick from, for the builder's palette (#59).
 * Per-criterion parameter defaults are not on the evaluator interface yet --
 * they arrive with the builder.
 */
export const catalogue: readonly CatalogueEntry[] = builtInEvaluators.map((evaluator) => ({
  id: evaluator.id,
  needs: [...evaluator.needs],
}));
