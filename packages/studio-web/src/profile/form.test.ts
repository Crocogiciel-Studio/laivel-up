import { describe, expect, it } from 'vitest';
import { emptyForm, fromBody, toBody } from './form.js';

describe('profile form transform', () => {
  it('omits a section that is toggled off', () => {
    const f = emptyForm();
    f.subject.id = 'dev-1';
    f.sections.declared = true;
    f.values['declared.stack'] = 'ts, go';
    const { body, issues } = toBody(f);
    expect(issues).toEqual([]);
    expect(body).toMatchObject({ subject: { id: 'dev-1' }, declared: { stack: ['ts', 'go'] } });
    expect(body).not.toHaveProperty('vcsActivity');
    expect(body).not.toHaveProperty('workSession');
  });

  it('fills the required tooling-context fields', () => {
    const f = emptyForm();
    f.subject.id = 'x';
    f.sections.toolingContext = true;
    f.values['toolingContext.rulesCount'] = '3';
    const { body } = toBody(f);
    const tc = (body.toolingContext ?? {}) as Record<string, unknown>;
    expect(tc.projectMemoryPresent).toBe(false);
    expect(tc.rulesCount).toBe(3);
    expect(tc.skillsCount).toBe(0);
  });

  it('builds sizeDistribution only when all five buckets are set', () => {
    const f = emptyForm();
    f.subject.id = 'x';
    f.sections.vcsActivity = true;
    const buckets: [string, string][] = [
      ['sd_xs', '1'],
      ['sd_s', '2'],
      ['sd_m', '3'],
      ['sd_l', '4'],
    ];
    for (const [k, v] of buckets) {
      f.values[`vcsActivity.pullRequests.${k}`] = v;
    }
    expect(JSON.stringify(toBody(f).body)).not.toContain('sizeDistribution');

    f.values['vcsActivity.pullRequests.sd_xl'] = '5';
    const full = toBody(f);
    expect(full.issues).toEqual([]);
    const pr = ((full.body.vcsActivity as Record<string, unknown>).pullRequests ?? {}) as Record<
      string,
      unknown
    >;
    expect(pr.sizeDistribution).toEqual({ xs: 1, s: 2, m: 3, l: 4, xl: 5 });
  });

  it('reports a form-level issue instead of dropping a partial size distribution', () => {
    const f = emptyForm();
    f.subject.id = 'x';
    f.sections.vcsActivity = true;
    f.values['vcsActivity.pullRequests.sd_xs'] = '1';
    f.values['vcsActivity.pullRequests.sd_s'] = '2';
    const { issues } = toBody(f);
    expect(issues).toEqual([
      'Pull requests → size distribution: fill all five buckets (xs–xl), or none.',
    ]);
  });

  it('round-trips a body through fromBody -> toBody exactly', () => {
    const body = {
      subject: { id: 'dev-2', role: 'lead', experienceYears: 7 },
      declared: { stack: ['ts'], notes: ['a', 'b'], teamSize: 4 },
      vcsActivity: {
        commits: { aiCoauthoredRatio: 0.8 },
        rawPullRequests: [{ changedFiles: 3, additions: 40 }],
      },
      workSession: { framingOnly: true, rawText: 'line1\nline2' },
    };
    const { body: back, issues } = toBody(fromBody('P', body));
    expect(issues).toEqual([]);
    // toEqual, not toMatchObject: an extra section in the output would change
    // the derived `available` and must fail this test.
    expect(back).toEqual(body);
  });
});
