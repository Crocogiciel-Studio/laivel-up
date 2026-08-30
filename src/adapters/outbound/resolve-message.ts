import type { Message } from '../../core/model/evaluation.js';

/**
 * A flat catalogue: message key -> template with `{param}` placeholders. One per
 * language, authored under `i18n/`. The core never sees this — resolution is a
 * consumer's job, so the same `Evaluation` renders in any language.
 */
export type MessageCatalogue = Readonly<Record<string, string>>;

/**
 * Fill a `Message`'s template from a catalogue. An unknown key falls back to the
 * key itself; an unfilled `{param}` is left visible rather than dropped, so a
 * mismatch is obvious instead of silent.
 */
export function resolveMessage(message: Message, catalogue: MessageCatalogue): string {
  const template = catalogue[message.key] ?? message.key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = message.params?.[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}
