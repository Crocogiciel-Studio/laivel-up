/**
 * Engine sentences. `note` and progression `actions` arrive as `{ key, params }`
 * descriptors (core #42); resolve them against the core's own catalogues, which
 * are bundled at build time so nothing is fetched. This is separate from
 * `i18n.ts` — that one holds the strings the UI itself writes.
 */
import type { Message } from './evaluation';
import type { Lang } from './i18n';
import en from '../../i18n/en.json';
import fr from '../../i18n/fr.json';

type Catalogue = Readonly<Record<string, string>>;

const CATALOGUES: Readonly<Record<Lang, Catalogue>> = { en, fr };

/**
 * Fill a descriptor's template. Unknown key -> the key itself; an unfilled
 * `{param}` stays visible; a param value that is itself a namespaced catalogue
 * key (e.g. `factor.margin`) is resolved too. Tolerates a plain string, so an
 * evaluation.json produced before #42 still renders.
 */
export function resolveMessage(message: Message | string, lang: Lang): string {
  const catalogue = CATALOGUES[lang];
  if (typeof message === 'string') return catalogue[message] ?? message;

  const template = catalogue[message.key] ?? message.key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = message.params?.[name];
    if (value === undefined) return `{${name}}`;
    const text = String(value);
    return text.includes('.') && catalogue[text] !== undefined ? catalogue[text] : text;
  });
}
