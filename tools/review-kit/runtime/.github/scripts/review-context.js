// Stages 1 and 2 of docs/agents/review-pipeline.md: build the reviewer input, decide who runs.
//
//   require('./.github/scripts/review-context.js')({ github, context, core })
//
// Writes <reviewDir>/<key>/in/{input.json,diff.patch} for the reviewers and <reviewDir>/<key>/run.json
// for the publish step. CommonJS, because actions/github-script requires CJS.
//
// Nothing repo-specific lives here: what is excluded and who is routed comes from
// review-config.js.

const { writeFileSync, mkdirSync } = require("node:fs");
const config = require("./review-config.js");
const corpus = require("./review-corpus.js");
const pins = require("./review-pins.js");

const STATUS = { added: "added", removed: "deleted", copied: "added", changed: "modified" };

const inScopeFiles = (input) => input.files.map((f) => f.file);

/** The ownership registry, when there is one. A missing or broken one costs attribution, not the run. */
function readOwners(cfg, core) {
    const file = `${cfg.docsRoot}/review-ownership.json`;
    if (!require("node:fs").existsSync(file)) return {};
    try {
        return JSON.parse(require("node:fs").readFileSync(file, "utf8")).owners || {};
    } catch (e) {
        core.warning(`${file} does not parse, so engaged rules are unattributed - ${e.message}`);
        return {};
    }
}

/**
 * The lines a comment may anchor to, per file.
 *
 * A hunk header already declares its right-hand side: `@@ -a,b +c,d @@` means d lines starting
 * at c.
 */
function hunkRanges(patch) {
    const out = [];
    for (const m of patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
        const start = Number(m[1]);
        const count = m[2] === undefined ? 1 : Number(m[2]);
        if (count > 0) out.push([start, start + count - 1]);
    }
    return out;
}

/**
 * listFiles returns each file's hunks with no `diff --git`/`---`/`+++` header. Those carry the
 * path and the added/deleted state, so put them back.
 */
function unifiedDiff(files) {
    return files
        .filter((f) => f.patch)
        .map((f) => {
            const old = f.previous_filename || f.filename;
            const a = f.status === "added" ? "/dev/null" : `a/${old}`;
            const b = f.status === "removed" ? "/dev/null" : `b/${f.filename}`;
            return `diff --git a/${old} b/${f.filename}\n--- ${a}\n+++ ${b}\n${f.patch}`;
        })
        .join("\n");
}

/** The CI state at this sha, as one line. Recorded, never a gate. */
function ciStatus(others, failing) {
    if (!others.length) return "no checks reported for this sha";
    if (failing.length) return `failing: ${failing.map((c) => c.name).join(", ")}`;
    if (others.some((c) => c.status !== "completed")) return "still running";
    return `all ${others.length} checks green`;
}

/** Split the changed files into the ones a reviewer sees and the ones the config excludes. */
function partitionFiles(all, cfg, run) {
    const kept = [];
    for (const f of all) {
        const skip = cfg.exclude.find((e) => e.regex.test(f.filename));
        if (skip) run.excluded.push({ file: f.filename, reason: `${skip.reason} - review-contract.md#do-not-report` });
        else kept.push(f);
    }
    return kept;
}

/** The rules this diff engages, worked out from the globs the rules themselves declare. */
function attachEngagedRules(input, run, cfg, core) {
    const owners = readOwners(cfg, core);
    const engaged = corpus.match(inScopeFiles(input));
    if (!engaged.length) return;
    input.rules = engaged.map((r) => ({
        id: r.id,
        title: r.title,
        ...(r.description ? { description: r.description } : {}),
        appliesTo: r.appliesTo,
        files: r.matched,
        owners: corpus.ownerOf(r.id, owners),
    }));
    run.rules = { engaged: engaged.length, unowned: input.rules.filter((r) => !r.owners.length).map((r) => r.id) };
    if (run.rules.unowned.length)
        core.warning(`${run.rules.unowned.length} engaged rule(s) belong to no axis, so no reviewer will cite them: ${run.rules.unowned.slice(0, 5).join(", ")}`);
}

/** Which axes run: the always-axes, plus any whose route matches a path in the diff. */
function routeAgents(cfg, input, run) {
    const inScope = inScopeFiles(input);
    const withExcluded = [...inScope, ...run.excluded.map((e) => e.file)];
    const agents = [];
    run.routing = {};
    for (const axis of cfg.axes) {
        if (axis.always) {
            run.routing[axis.name] = "always";
            agents.push(axis.name);
            continue;
        }
        const pool = axis.routeIncludesExcluded ? withExcluded : inScope;
        const hits = pool.filter((f) => axis.regex.test(f));
        run.routing[axis.name] = hits.length ? hits.slice(0, 3).join(", ") : "no matching path in the diff";
        if (hits.length) agents.push(axis.name);
    }
    return agents;
}

module.exports = async function buildContext({ github, context, core }) {
    const cfg = config();
    const { owner, repo } = context.repo;
    const pull_number = Number(process.env.PR_NUMBER);

    const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number });
    const key = `pr-${pull_number}`;
    const dir = `${cfg.reviewDir}/${key}`;
    mkdirSync(`${dir}/in`, { recursive: true });

    const run = {
        key,
        repo: `${owner}/${repo}`,
        pull_number,
        title: pr.title,
        head: pr.head.sha,
        baseRef: pr.base.ref,
        config: cfg.file,
        notes: cfg.coverageNotes,
    };
    const write = () => writeFileSync(`${dir}/run.json`, `${JSON.stringify(run, null, 2)}\n`);

    // The one reason not to review: there is nothing a reviewer could be given.
    const decline = (why) => {
        run.skip = why;
        write();
        core.setOutput("skip", why);
        core.setOutput("key", key);
        core.notice(`not reviewing: ${why}`);
    };

    // The merge base. `pr.base.sha` would be the base branch tip: review-pipeline.md#context.
    const { data: cmp } = await github.rest.repos.compareCommits({ owner, repo, base: pr.base.ref, head: pr.head.sha });
    run.base = cmp.merge_base_commit.sha;

    const all = await github.paginate(github.rest.pulls.listFiles, { owner, repo, pull_number, per_page: 100 });

    run.excluded = [];
    const kept = partitionFiles(all, cfg, run);

    run.size = { files: kept.length, changed: kept.reduce((n, f) => n + f.additions + f.deletions, 0) };
    if (!kept.length) return decline("every changed file is excluded by review-contract.md#do-not-report");

    // Recorded, never a gate: review-publish.js states it, and a human asked for this review.
    const checks = await github.paginate(github.rest.checks.listForRef, { owner, repo, ref: pr.head.sha, per_page: 100 });
    // Exclude this workflow's own check runs, or our in-progress job reads as "still running".
    const others = checks.filter((c) => !(c.details_url || "").includes(`/runs/${context.runId}/`));
    const failing = others.filter((c) => ["failure", "timed_out", "cancelled"].includes(c.conclusion));
    run.ci = ciStatus(others, failing);

    const input = {
        base: run.base,
        head: pr.head.sha,
        diffPath: `${dir}/in/diff.patch`,
        files: kept.map((f) => ({
            file: f.filename,
            status: STATUS[f.status] || f.status,
            ...(f.patch ? { lines: hunkRanges(f.patch) } : {}),
        })),
    };
    if (pr.body) input.intent = { title: pr.title, description: pr.body };
    else run.intentMissing = true;

    // A reviewer should not have to go looking for the rule that governs a file it was handed -
    // and a generated corpus changes too often for anyone to keep that lookup in their head.
    attachEngagedRules(input, run, cfg, core);

    writeFileSync(`${dir}/in/diff.patch`, `${unifiedDiff(kept)}\n`);
    writeFileSync(`${dir}/in/input.json`, `${JSON.stringify(input, null, 2)}\n`);

    // An axis with `routeIncludesExcluded` is routed by an excluded path too - "this generated
    // file looks hand-edited" is a finding about a file nobody may read the contents of.
    const agents = routeAgents(cfg, input, run);
    run.agents = agents;
    write();

    core.info(`base ${run.base.slice(0, 8)} head ${pr.head.sha.slice(0, 8)}`);
    core.info(`${kept.length} files in scope, ${run.excluded.length} excluded, CI: ${run.ci}`);
    for (const [agent, why] of Object.entries(run.routing)) {
        core.info(`  ${agents.includes(agent) ? "run " : "skip"} ${agent.padEnd(11)} ${why}`);
    }

    core.setOutput("skip", "");
    core.setOutput("key", key);
    core.setOutput("head", pr.head.sha);
    core.setOutput("baseRef", pr.base.ref);
    core.setOutput("docsRoot", cfg.docsRoot);
    core.setOutput("agentsRoot", cfg.agentsRoot);
    core.setOutput("reviewDir", cfg.reviewDir);
    core.setOutput("agents", JSON.stringify(agents));
    // One matrix entry per axis, carrying its pinned model and effort.
    core.setOutput(
        "matrix",
        JSON.stringify(
            agents.map((name) => {
                const axis = cfg.axes.find((a) => a.name === name);
                return { agent: name, web: Boolean(axis.web), ...pins(name) };
            }),
        ),
    );
};
