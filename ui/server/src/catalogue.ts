import { builtInEvaluators } from 'laivel-up/compose';

export interface CatalogueEntry {
  readonly id: string;
  /** Profile sections the criterion reads; absent ones make it return "unknown". */
  readonly needs: readonly string[];
  /**
   * In-code defaults for the criterion's calibration knobs. The grid builder
   * (#59) pre-fills a criterion card with these; a grid preset overrides a
   * subset through the bundle entry's `params`.
   */
  readonly paramDefaults: Readonly<Record<string, number>>;
}

/** The coded criteria a grid can pick from, for the builder's palette (#59). */
export const catalogue: readonly CatalogueEntry[] = builtInEvaluators.map((evaluator) => ({
  id: evaluator.id,
  needs: [...evaluator.needs],
  paramDefaults: { ...evaluator.paramDefaults },
}));
