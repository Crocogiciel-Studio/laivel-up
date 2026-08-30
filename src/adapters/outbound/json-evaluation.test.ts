import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../core/engine/evaluate.js';
import { inMemoryCatalogue } from '../catalogue/in-memory-catalogue.js';
import { builtInEvaluators } from '../../criteria/index.js';
import { jsonGridSource } from '../inbound/json-grid.js';
import { readProfileFromDirectory } from '../inbound/json-profile.js';
import { renderEvaluationJson } from './json-evaluation.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GRID_PATH = resolve(HERE, '../../../presets/aidd.json');
const PROFILE_DIR = resolve(HERE, '../../../examples/dev-sample');
const SCHEMA_PATH = resolve(HERE, '../../../docs/evaluation.schema.json');

const NOW = (): Date => new Date('2026-08-30T00:00:00.000Z');

// -- A small structural JSON-Schema-subset validator --------------------
//
// No `ajv` import: it is only a transitive dev dependency (via eslint
// tooling), not declared in package.json (see the plan's Decisions). This
// walks a subset of JSON Schema — type, enum, required, properties,
// additionalProperties: false, items — which is exactly what
// docs/evaluation.schema.json is written against.

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface JsonSchema {
  readonly type?: string | readonly string[];
  readonly enum?: readonly JsonValue[];
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly additionalProperties?: boolean;
  readonly items?: JsonSchema;
}

function typeOf(value: JsonValue): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validate(value: JsonValue, schema: JsonSchema, path: string, violations: string[]): void {
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.includes(typeOf(value))) {
      violations.push(`${path}: expected type ${allowed.join(' | ')}, got ${typeOf(value)}`);
      return;
    }
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    violations.push(`${path}: value ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
  }

  if (typeOf(value) === 'object') {
    const obj = value as Readonly<Record<string, JsonValue>>;
    const properties = schema.properties ?? {};

    for (const key of schema.required ?? []) {
      if (!(key in obj)) {
        violations.push(`${path}: missing required property "${key}"`);
      }
    }

    for (const [key, propValue] of Object.entries(obj)) {
      const propSchema = properties[key];
      if (propSchema === undefined) {
        if (schema.additionalProperties === false) {
          violations.push(`${path}: unexpected property "${key}"`);
        }
        continue;
      }
      validate(propValue, propSchema, `${path}.${key}`, violations);
    }
  }

  const itemSchema = schema.items;
  if (typeOf(value) === 'array' && itemSchema !== undefined) {
    const items = value as readonly JsonValue[];
    items.forEach((item, index) => {
      validate(item, itemSchema, `${path}[${String(index)}]`, violations);
    });
  }
}

function validateAgainstSchema(value: JsonValue, schema: JsonSchema): string[] {
  const violations: string[] = [];
  validate(value, schema, '$', violations);
  return violations;
}

// -------------------------------------------------------------------------

const gridResult = jsonGridSource(GRID_PATH).load();
if (!gridResult.ok) {
  throw new Error(`preset failed to load: ${gridResult.error.message}`);
}
const grid = gridResult.value;

const profileResult = readProfileFromDirectory(PROFILE_DIR);
if (!profileResult.ok) {
  throw new Error(`profile failed to load: ${profileResult.error.message}`);
}
const profile = profileResult.value;

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as JsonSchema;

function parsedEvaluation(catalogue: ReturnType<typeof inMemoryCatalogue>): Record<string, JsonValue> {
  const evaluation = evaluate(profile, grid, catalogue, { now: NOW });
  return JSON.parse(renderEvaluationJson(evaluation)) as Record<string, JsonValue>;
}

describe('renderEvaluationJson conforms to docs/evaluation.schema.json', () => {
  it('validates a real evaluate() output clean', () => {
    const parsed = parsedEvaluation(inMemoryCatalogue(builtInEvaluators));

    const violations = validateAgainstSchema(parsed, schema);
    expect(violations).toEqual([]);
  });

  it('omits levelId/levelRank/bindingAxisId (not null) when every axis is unknown, and still validates clean', () => {
    const parsed = parsedEvaluation(inMemoryCatalogue([]));
    const parsedGlobal = parsed.global as Record<string, JsonValue>;

    expect('levelId' in parsedGlobal).toBe(false);
    expect('levelRank' in parsedGlobal).toBe(false);
    expect('bindingAxisId' in parsedGlobal).toBe(false);

    const violations = validateAgainstSchema(parsed, schema);
    expect(violations).toEqual([]);
  });

  it('reports a violation for an unmodeled extra field (schema drift guard)', () => {
    const parsed = parsedEvaluation(inMemoryCatalogue(builtInEvaluators));

    // The model has no spare field to add without editing src/core/model/evaluation.ts,
    // which is out of scope here. Injecting an unexpected key into the serialized
    // output exercises the same guard: additionalProperties: false catching a shape
    // the schema doesn't declare, which is what "the test fails if Evaluation gains
    // an undocumented field" cashes out to for a structural (not ajv) validator. The
    // real drift guard is additionalProperties: false in the two tests above, which
    // reject any unmodeled property at any depth; this test proves the validator
    // itself is not vacuously permissive.
    parsed.extraField = 'x';

    const violations = validateAgainstSchema(parsed, schema);
    expect(violations.length).toBeGreaterThan(0);
  });
});
