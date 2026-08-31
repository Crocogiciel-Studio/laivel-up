import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Grid } from '../../core/model/grid.js';
import type { Profile } from '../../core/model/profile.js';
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

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as JsonSchema;

let grid: Grid;
let profile: Profile;

beforeAll(() => {
  const gridResult = jsonGridSource(GRID_PATH).load();
  expect(gridResult.ok, gridResult.ok ? '' : gridResult.error.message).toBe(true);
  const profileResult = readProfileFromDirectory(PROFILE_DIR);
  expect(profileResult.ok, profileResult.ok ? '' : profileResult.error.message).toBe(true);
  if (!gridResult.ok || !profileResult.ok) throw new Error('unreachable: asserted ok above');
  grid = gridResult.value;
  profile = profileResult.value;
});

function parsedEvaluation(catalogue: ReturnType<typeof inMemoryCatalogue>): Record<string, JsonValue> {
  const evaluation = evaluate(profile, grid, catalogue, { now: NOW });
  return JSON.parse(renderEvaluationJson(evaluation)) as Record<string, JsonValue>;
}

function axesOf(parsed: Record<string, JsonValue>): Record<string, JsonValue>[] {
  return parsed.axes as Record<string, JsonValue>[];
}

function readingsOf(parsed: Record<string, JsonValue>): Record<string, JsonValue>[] {
  return axesOf(parsed).flatMap((axis) => axis.readings as Record<string, JsonValue>[]);
}

function firstAxisWithReadings(parsed: Record<string, JsonValue>): Record<string, JsonValue> {
  const axis = axesOf(parsed).find((a) => (a.readings as JsonValue[]).length > 0);
  if (axis === undefined) throw new Error('no axis carries a reading');
  return axis;
}

describe('renderEvaluationJson conforms to docs/evaluation.schema.json', () => {
  it('validates a real evaluate() output clean, exercising a read reading', () => {
    const parsed = parsedEvaluation(inMemoryCatalogue(builtInEvaluators));

    // Guard against the example silently degrading to all-unknown: without a read
    // reading this test never touches status: "read", levelId, levelRank or rawValue.
    const readReading = readingsOf(parsed).find(
      (r) => r.status === 'read' && typeof r.levelId === 'string' && r.rawValue !== undefined,
    );
    expect(readReading, 'examples/dev-sample produced no read reading with a levelId and rawValue').toBeDefined();
    expect(typeof readReading?.levelRank).toBe('number');

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

  it('reports a violation for an unmodeled field at the root and at every nested depth', () => {
    // Proves the validator is not vacuously permissive: additionalProperties: false
    // must bite at the root object, inside an axis, and inside a reading.
    const rootDrift = parsedEvaluation(inMemoryCatalogue(builtInEvaluators));
    rootDrift.extraField = 'x';
    expect(validateAgainstSchema(rootDrift, schema)).toContain('$: unexpected property "extraField"');

    const axisDrift = parsedEvaluation(inMemoryCatalogue(builtInEvaluators));
    const driftedAxisIndex = axesOf(axisDrift).findIndex((a) => (a.readings as JsonValue[]).length > 0);
    axesOf(axisDrift)[driftedAxisIndex]!.extraField = 'x';
    expect(validateAgainstSchema(axisDrift, schema)).toContain(
      `$.axes[${String(driftedAxisIndex)}]: unexpected property "extraField"`,
    );

    const readingDrift = parsedEvaluation(inMemoryCatalogue(builtInEvaluators));
    const firstAxis = firstAxisWithReadings(readingDrift);
    const axisIndex = axesOf(readingDrift).indexOf(firstAxis);
    (firstAxis.readings as Record<string, JsonValue>[])[0]!.extraField = 'x';
    expect(validateAgainstSchema(readingDrift, schema)).toContain(
      `$.axes[${String(axisIndex)}].readings[0]: unexpected property "extraField"`,
    );
  });
});
