import type { z } from 'zod';

/** Flatten a ZodError into `path: message` lines for a Result's `issues`. */
export function zodIssues(error: z.ZodError): readonly string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
}
