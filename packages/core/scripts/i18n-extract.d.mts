export interface CatalogueReport {
  /** Every `msg('…')` key found in src/, sorted. */
  readonly keys: readonly string[];
  /** Keys in the code with no en.json entry (fatal for the CLI). */
  readonly missingEn: readonly string[];
  /** Keys in the code with no fr.json entry. */
  readonly missingFr: readonly string[];
  /** en.json entries no code references. */
  readonly orphanEn: readonly string[];
  /** fr.json entries no code references. */
  readonly orphanFr: readonly string[];
}

export function checkCatalogues(root?: string): CatalogueReport;
