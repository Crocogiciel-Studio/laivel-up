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
  'loaded.error': 'Could not read that file: {reason}',
  'lang.label': 'Language',
  'profile.label': 'Profile',

  'verdict.heading': 'Level',
  'verdict.for': '{subject} · grid {grid}',
  'verdict.confidence': 'Confidence {pct}%',
  'verdict.binding': 'Held back by {axis}',
  'verdict.unranked': 'No level ruled',
  'verdict.generated': 'Generated {at}',
  'axes.heading': 'Axes',
  'axis.confidence': 'confidence {pct}%',
  'axis.limitedBy': 'limited by {factor}',
  'axis.unknown': 'not ruled',
  'axis.binding': 'binding',
  'reading.criterion': 'Criterion',
  'reading.role': 'Role',
  'reading.status': 'Status',
  'reading.level': 'Level',
  'reading.raw': 'Value',
  'reading.confidence': 'Conf.',
  'reading.evidence': 'Evidence',
  'progression.heading': 'To progress',
  'progression.target': 'Target: {level}',
  'raw.summary': 'Raw JSON',
  'grid.unknown': 'Grid "{grid}" is not bundled — levels and axes show as ids.',
  'engine.note': 'Engine sentences are English until the i18n contract (#42) lands.',

  'factor.agreement': 'signal agreement',
  'factor.margin': 'margin to threshold',
  'factor.sufficiency': 'evidence sufficiency',
  'factor.none': 'nothing',
  'role.level': 'level',
  'role.confidence': 'confidence',
  'role.cap': 'cap',
  'status.read': 'read',
  'status.unknown': 'unknown',
};

const fr: Catalogue = {
  'app.title': 'laivel-up — visualiseur d’évaluation',
  'app.tagline': 'Déposez un evaluation.json produit par la CLI pour le voir rendu.',
  'drop.cta': 'Déposez evaluation.json ici, ou cliquez pour choisir un fichier',
  'drop.hint': 'Tout s’exécute dans votre navigateur. Aucun envoi, aucun réseau.',
  'loaded.error': 'Lecture du fichier impossible : {reason}',
  'lang.label': 'Langue',
  'profile.label': 'Profil',

  'verdict.heading': 'Niveau',
  'verdict.for': '{subject} · grille {grid}',
  'verdict.confidence': 'Confiance {pct} %',
  'verdict.binding': 'Bridé par {axis}',
  'verdict.unranked': 'Aucun niveau statué',
  'verdict.generated': 'Généré le {at}',
  'axes.heading': 'Axes',
  'axis.confidence': 'confiance {pct} %',
  'axis.limitedBy': 'limité par {factor}',
  'axis.unknown': 'non statué',
  'axis.binding': 'contraignant',
  'reading.criterion': 'Critère',
  'reading.role': 'Rôle',
  'reading.status': 'Statut',
  'reading.level': 'Niveau',
  'reading.raw': 'Valeur',
  'reading.confidence': 'Conf.',
  'reading.evidence': 'Preuve',
  'progression.heading': 'Pour progresser',
  'progression.target': 'Cible : {level}',
  'raw.summary': 'JSON brut',
  'grid.unknown': 'La grille « {grid} » n’est pas embarquée — niveaux et axes affichés en ids.',
  'engine.note': 'Les phrases du moteur restent en anglais tant que le contrat i18n (#42) n’est pas livré.',

  'factor.agreement': 'accord des signaux',
  'factor.margin': 'marge au seuil',
  'factor.sufficiency': 'suffisance des preuves',
  'factor.none': 'rien',
  'role.level': 'niveau',
  'role.confidence': 'confiance',
  'role.cap': 'plafond',
  'status.read': 'lu',
  'status.unknown': 'inconnu',
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
