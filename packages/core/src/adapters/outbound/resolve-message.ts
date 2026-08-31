import type { Message } from '../../core/model/evaluation.js';

/**
 * A flat catalogue: message key -> template with `{param}` placeholders. One per
 * language, authored under `i18n/`. The core never sees this — resolution is a
 * consumer's job, so the same `Evaluation` renders in any language.
 */
export type MessageCatalogue = Readonly<Record<string, string>>;

const isMessage = (v: unknown): v is Message =>
  typeof v === 'object' && v !== null && typeof (v as { key?: unknown }).key === 'string';

/**
 * Fill a `Message`'s template from a catalogue. An unknown key falls back to the
 * key itself; an unfilled `{param}` is left visible rather than dropped. A param
 * value that is a nested `Message` is resolved recursively; a plain string that
 * is itself a namespaced catalogue key (e.g. `band.cap-poor`) is looked up too,
 * so an enum reads in the target language.
 */
export function resolveMessage(message: Message, catalogue: MessageCatalogue): string {
  const template = catalogue[message.key] ?? message.key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = message.params?.[name];
    if (value === undefined) return `{${name}}`;
    if (isMessage(value)) return resolveMessage(value, catalogue);
    const text = String(value);
    return text.includes('.') && catalogue[text] !== undefined ? catalogue[text] : text;
  });
}
