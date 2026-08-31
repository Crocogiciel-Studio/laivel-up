/**
 * Engine sentences. `note` and progression `actions` arrive as `{ key, params }`
 * descriptors (core #42); resolve them against the core's own catalogues, which
 * are bundled at build time so nothing is fetched. This is separate from
 * `i18n.ts` — that one holds the strings the UI itself writes.
 */
import { type Message, isMessage } from './evaluation';
import type { Lang } from './i18n';
import { fillTemplate } from './interpolate';
import en from 'laivel-up/i18n/en.json';
import fr from 'laivel-up/i18n/fr.json';

type Catalogue = Readonly<Record<string, string>>;

const CATALOGUES: Readonly<Record<Lang, Catalogue>> = { en, fr };

/** The catalogue key a descriptor (or a bare pre-#42 string) carries, or `''` if it is neither. */
const keyOf = (message: unknown): string =>
  typeof message === 'string' ? message : isMessage(message) ? message.key : '';

/**
 * Fill a descriptor's template. Unknown key -> the key itself; a key missing in
 * the requested language falls back to English (like `i18n.ts`); an unfilled
 * `{param}` stays visible; a namespaced param value (e.g. `factor.margin`) is
 * resolved too, and a nested `Message` recursively. A malformed value (missing
 * `note`, a non-object action) yields `''` rather than throwing out of `render()`.
 * `isMessage` mirrors the core resolver's guard — the two packages stay
 * deliberately decoupled (this one bundles the catalogues), so the two-line
 * echo is intentional.
 */
export function resolveMessage(message: Message | string, lang: Lang): string {
  const key = keyOf(message);
  if (key === '') return '';

  const inLang = CATALOGUES[lang];
  const lookupCatalogue = (k: string): string | undefined => inLang[k] ?? CATALOGUES.en[k];
  const params = typeof message === 'string' ? undefined : message.params;

  return fillTemplate(lookupCatalogue(key) ?? key, (name) => {
    const value = params?.[name];
    if (value === undefined) return undefined;
    if (isMessage(value)) return resolveMessage(value, lang);
    const text = String(value);
    return text.includes('.') ? (lookupCatalogue(text) ?? text) : text;
  });
}
