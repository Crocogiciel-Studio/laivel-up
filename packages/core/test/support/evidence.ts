import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Message } from '../../src/core/model/evaluation.js';
import { resolveMessage, type MessageCatalogue } from '../../src/adapters/outbound/resolve-message.js';

const EN = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../i18n/en.json'), 'utf8'),
) as MessageCatalogue;

/** Resolve a criterion/engine `Message` to its English sentence for assertions. */
export const evidenceText = (message: Message): string => resolveMessage(message, EN);
