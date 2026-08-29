import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Grille } from '../../core/model/grille.js';
import type { Result } from '../../core/model/result.js';
import { ok, err } from '../../core/model/result.js';
import type { GrilleSource, SourceError } from '../../core/ports/io.js';
import { sourceError } from '../../core/ports/io.js';

const levelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  rank: z.number().int(),
});

const faisceauEntrySchema = z.object({
  criterionId: z.string().min(1),
  weight: z.number().positive(),
  role: z.enum(['level', 'confidence', 'cap']),
  params: z.record(z.string(), z.number()).default({}),
});

const axisSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  faisceau: z.array(faisceauEntrySchema).default([]),
});

const grilleSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    levels: z.array(levelSchema).min(1),
    axes: z.array(axisSchema).min(1),
    axisAggregation: z.literal('confidence-weighted-vote').default('confidence-weighted-vote'),
    globalAggregation: z.literal('min-across-axes').default('min-across-axes'),
  })
  .superRefine((value, ctx) => {
    const ranks = new Set(value.levels.map((level) => level.rank));
    if (ranks.size !== value.levels.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'level ranks must be unique' });
    }
    const ids = new Set(value.levels.map((level) => level.id));
    if (ids.size !== value.levels.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'level ids must be unique' });
    }
    const axisIds = new Set(value.axes.map((axis) => axis.id));
    if (axisIds.size !== value.axes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'axis ids must be unique' });
    }
  });

function issuesOf(error: z.ZodError): readonly string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
}

export function parseGrille(input: unknown): Result<Grille, SourceError> {
  const parsed = grilleSchema.safeParse(input);
  if (!parsed.success) {
    return err(sourceError('grille preset is invalid', issuesOf(parsed.error)));
  }
  const value = parsed.data;
  const grille: Grille = {
    id: value.id,
    label: value.label,
    levels: value.levels.map((level) => ({
      id: level.id,
      label: level.label,
      rank: level.rank,
    })),
    axes: value.axes.map((axis) => ({
      id: axis.id,
      label: axis.label,
      faisceau: axis.faisceau.map((entry) => ({
        criterionId: entry.criterionId,
        weight: entry.weight,
        role: entry.role,
        params: entry.params,
      })),
    })),
    axisAggregation: value.axisAggregation,
    globalAggregation: value.globalAggregation,
  };
  return ok(grille);
}

export function jsonGrilleSource(filePath: string): GrilleSource {
  return {
    load(): Result<Grille, SourceError> {
      let raw: string;
      try {
        raw = readFileSync(filePath, 'utf8');
      } catch (cause) {
        return err(sourceError(`cannot read grille file: ${filePath}`, [String(cause)]));
      }
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch (cause) {
        return err(sourceError(`grille file is not valid JSON: ${filePath}`, [String(cause)]));
      }
      return parseGrille(json);
    },
  };
}
