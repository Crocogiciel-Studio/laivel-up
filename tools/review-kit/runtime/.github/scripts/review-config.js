#!/usr/bin/env node
// The one repo-specific file in the pipeline. Everything else under .github/scripts/ is portable.
//
//   require('./.github/scripts/review-config.js')()   -> the validated config
//   node .github/scripts/review-config.js             -> print it, resolved
//
// Lives at docs/agents/review.config.json by default; REVIEW_CONFIG overrides the path, which is
// what lets one checkout hold more than one configuration (a monorepo, a trial run).

const { readFileSync, existsSync } = require("node:fs");

const CANDIDATES = [process.env.REVIEW_CONFIG, "docs/agents/review.config.json", ".review.config.json"];

const DEFAULTS = {
    docsRoot: "docs/agents",
    agentsRoot: ".claude/agents",
    reviewDir: ".review",
    trigger: "@claude deep-review",
    integration: { agent: "integration" },
    limits: { nitsInline: 10, maxComments: 50 },
    coverageNotes: {},
    corpus: { sources: [] },
    exclude: [],
    axes: [],
};

let cached;

/** Locate and parse the config file, or throw with the paths that were tried. */
function loadRaw() {
    const file = CANDIDATES.filter(Boolean).find((f) => existsSync(f));
    if (!file) throw new Error(`no review config found - looked for ${CANDIDATES.filter(Boolean).join(", ")}`);
    try {
        return { file, raw: JSON.parse(readFileSync(file, "utf8")) };
    } catch (e) {
        throw new Error(`${file}: not valid JSON - ${e.message}`);
    }
}

/** One axis: valid name and prefix, neither seen before, and some way to be selected for a run. */
function validateOneAxis(a, at, seen, problems) {
    if (!a.name || !/^[a-z][a-z0-9-]*$/.test(a.name)) problems.push(`${at}.name must be lower-kebab`);
    if (!a.prefix || !/^[a-z]{2,4}$/.test(a.prefix)) problems.push(`${at}.prefix must be 2-4 lowercase letters`);
    if (seen.names.has(a.name)) problems.push(`${at}.name "${a.name}" is used twice`);
    if (seen.prefixes.has(a.prefix)) problems.push(`${at}.prefix "${a.prefix}" is used twice - ids would collide`);
    seen.names.add(a.name);
    seen.prefixes.add(a.prefix);
    if (!a.always && !a.route) problems.push(`${at} is neither \`always\` nor routed: it could never run`);
    if (!a.route) return;
    try {
        a.regex = new RegExp(a.route);
    } catch (e) {
        problems.push(`${at}.route is not a valid regex - ${e.message}`);
    }
}

/** Each axis: a valid name and prefix, both unique, and a way to be selected for a run. */
function validateAxes(c, problems) {
    if (!Array.isArray(c.axes) || !c.axes.length) problems.push("`axes` must list at least one reviewer");

    const seen = { names: new Set(), prefixes: new Set() };
    for (const [i, a] of (c.axes || []).entries()) validateOneAxis(a, `axes[${i}]`, seen, problems);

    if (seen.names.has(c.integration.agent)) problems.push("the integration agent is not an axis: remove it from `axes`");
    if (!c.axes.some((a) => a.always)) problems.push("at least one axis must be `always: true` - a run with no reviewer is not a review");
}

const CORPUS_KINDS = new Set(["rules", "anchored", "memory"]);

/**
 * The corpus. `sources` may be empty - a repo with no written rules still gets a review, it just
 * gets one with fewer anchored findings.
 */
function validateCorpus(c, raw, problems) {
    c.corpus = { sources: [], ...raw.corpus };
    for (const [i, src] of c.corpus.sources.entries()) {
        const at = `corpus.sources[${i}]`;
        if (!CORPUS_KINDS.has(src.kind)) problems.push(`${at}.kind must be one of ${[...CORPUS_KINDS].join(", ")}`);
        if (src.kind === "rules" && !src.dir && !src.tool) problems.push(`${at} needs a \`tool\` (a known rule surface) or a \`dir\``);
        if ((src.kind === "anchored" || src.kind === "memory") && !src.dir) problems.push(`${at} needs a \`dir\``);
    }
}

/** Each exclusion: a pattern and a reason, and the pattern has to compile. */
function validateExcludes(c, problems) {
    for (const [i, e] of (c.exclude || []).entries()) {
        if (!e?.pattern || !e?.reason) {
            problems.push(`exclude[${i}] needs a \`pattern\` and a \`reason\``);
            continue;
        }
        try {
            e.regex = new RegExp(e.pattern);
        } catch (err) {
            problems.push(`exclude[${i}].pattern is not a valid regex - ${err.message}`);
        }
    }
}

/** Read, merge over the defaults, and refuse a configuration that cannot produce a review. */
module.exports = function config() {
    if (cached) return cached;

    const { file, raw } = loadRaw();
    const c = { ...DEFAULTS, ...raw, file };
    c.limits = { ...DEFAULTS.limits, ...raw.limits };
    c.integration = { ...DEFAULTS.integration, ...raw.integration };

    const problems = [];
    validateAxes(c, problems);
    validateCorpus(c, raw, problems);
    validateExcludes(c, problems);
    if (problems.length) throw new Error(`${file} is unusable:\n  - ${problems.join("\n  - ")}`);

    cached = c;
    return c;
};

if (require.main === module) {
    const c = module.exports();
    const plain = JSON.parse(JSON.stringify(c, (k, v) => (k === "regex" ? undefined : v)));
    process.stdout.write(`${JSON.stringify(plain, null, 2)}\n`);
}
