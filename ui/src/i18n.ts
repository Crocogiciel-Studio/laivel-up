/**
 * UI chrome strings only. Flat `key -> template` maps, same shape the core
 * catalogue will use (#42). The engine's own sentences (evidence / note /
 * actions) are NOT translated here — that is #42 + #41 viewer work.
 */

export type Lang = 'fr' | 'en';

export const LANGS: readonly Lang[] = ['fr', 'en'];

type Catalogue = Readonly<Record<string, string>>;

const en: Catalogue = {
  'app.title': 'laivel-up — evaluation viewer',
  'app.tagline': 'Drop an evaluation.json produced by the CLI to see it rendered.',
  'drop.cta': 'Drop evaluation.json here, or click to choose a file',
  'drop.hint': 'Everything runs in your browser. No upload, no network.',
  'scaffold.notice':
    'Scaffold only — the rendered view lands after the output schema (#21) and the i18n contract (#42).',
  'loaded.ok': 'Loaded evaluation for {subject} (grid {grid}).',
  'loaded.error': 'Could not read that file: {reason}',
  'lang.label': 'Language',
};

const fr: Catalogue = {
  'app.title': 'laivel-up — visualiseur d’évaluation',
  'app.tagline': 'Déposez un evaluation.json produit par la CLI pour le voir rendu.',
  'drop.cta': 'Déposez evaluation.json ici, ou cliquez pour choisir un fichier',
  'drop.hint': 'Tout s’exécute dans votre navigateur. Aucun envoi, aucun réseau.',
  'scaffold.notice':
    'Squelette seulement — la vue rendue arrive après le schéma de sortie (#21) et le contrat i18n (#42).',
  'loaded.ok': 'Évaluation chargée pour {subject} (grille {grid}).',
  'loaded.error': 'Lecture du fichier impossible : {reason}',
  'lang.label': 'Langue',
};

const CATALOGUES: Readonly<Record<Lang, Catalogue>> = { en, fr };

const STORAGE_KEY = 'laivel-up.ui.lang';

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') {
      return saved;
    }
  } catch {
    // localStorage unavailable (private mode, blocked) — fall through.
  }
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // best effort only.
  }
}

export function t(lang: Lang, key: string, params: Readonly<Record<string, string>> = {}): string {
  const template = CATALOGUES[lang][key] ?? CATALOGUES.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? `{${name}}`);
}
