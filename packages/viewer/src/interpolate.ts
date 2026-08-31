/**
 * Fill `{name}` slots in a template. `lookup` returns the value for a slot, or
 * `undefined` to leave it visible — a mismatch shows rather than vanishing.
 * The one place `{param}` syntax is understood; `i18n.ts` and `messages.ts`
 * both go through here.
 */
export function fillTemplate(
  template: string,
  lookup: (name: string) => string | undefined,
): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => lookup(name) ?? `{${name}}`);
}
