#!/usr/bin/env node
// Is this repo's review pipeline installed correctly? Run it after changing the config, an agent
// file or a rule anchor - and in CI, where a broken install would otherwise surface as a review
// that silently loses an axis.
//
//   node .github/scripts/review-doctor.js            -> report, exit 1 on an error
//   node .github/scripts/review-doctor.js --quiet    -> only problems
//
//   node .github/scripts/review-doctor.js --all      -> also run doc-lint, and fail if it does
//
// It checks the WIRING: that every axis in the config can actually run, that the schemas still
// reduce, that the workflow and the config still agree. The documentation tree - anchors defined
// and owned, references resolving, agents pinned - belongs to .claude/skills/doc-lint/check.mjs,
// and this file defers to it when it is installed. One invariant, one checker, for the same reason
// a rule anchor has one owner.

const { readFileSync, existsSync } = require("node:fs");
const { execFileSync } = require("node:child_process");

const quiet = process.argv.includes("--quiet");
const errors = [];
const warnings = [];
const notes = [];

const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const ok = (m) => notes.push(m);

let cfg;
try {
    cfg = require("./review-config.js")();
    ok(`config ${cfg.file}: ${cfg.axes.length} axes (${cfg.axes.map((a) => a.name).join(", ")})`);
} catch (e) {
    console.error(`review-doctor: ${e.message}`);
    process.exit(1);
}

const read = (f) => readFileSync(f, "utf8");
const agentFile = (name) => `${cfg.agentsRoot}/${name}-reviewer.md`;

// The doc tree's own authority. When it is installed, everything it already checks is its job.
const LINT = ".claude/skills/doc-lint/check.mjs";
const DELEGATE = existsSync(LINT);

// ---------------------------------------------------------------- agent files and their pins
for (const name of [...cfg.axes.map((a) => a.name), cfg.integration.agent]) {
    const file = agentFile(name);
    if (!existsSync(file)) {
        fail(`${file} is missing - the axis "${name}" is configured but has no agent file`);
        continue;
    }
    const front = read(file).split(/^---$/m)[1] || "";
    const get = (k) => (front.match(new RegExp(String.raw`^${k}:\s*(\S+)`, "m")) || [])[1];
    if (get("name") !== `${name}-reviewer`) fail(`${file}: frontmatter \`name\` must be "${name}-reviewer"`);
    // The pin is doc-lint's invariant, but an unpinned axis cannot be launched at all, so this one
    // is checked on both sides on purpose: here it is fatal to the run, there it is a doc defect.
    if (!get("model") || !get("effort")) fail(`${file}: \`model\` and \`effort\` must both be pinned`);
    else ok(`${file}: ${get("model")}/${get("effort")}`);
}

// ---------------------------------------------------------------- documents the pipeline needs
for (const f of ["review-contract.md", "review-pipeline.md"]) {
    if (!existsSync(`${cfg.docsRoot}/${f}`)) fail(`${cfg.docsRoot}/${f} is missing`);
}
for (const s of ["input", "output", "integration"]) {
    if (!existsSync(`${cfg.docsRoot}/schemas/review-${s}.schema.json`))
        fail(`${cfg.docsRoot}/schemas/review-${s}.schema.json is missing`);
}

// The schema the model is actually held to must be derivable and valid JSON.
for (const which of ["output", "integration"]) {
    try {
        JSON.parse(execFileSync(process.execPath, [`${__dirname}/review-schema.js`, which], { encoding: "utf8" }));
        ok(`review-schema.js ${which}: valid`);
    } catch (e) {
        fail(`review-schema.js ${which} does not produce valid JSON - ${e.message.split("\n")[0]}`);
    }
}

// ---------------------------------------------------------------- rule anchors and ownership
const ownershipFile = `${cfg.docsRoot}/review-ownership.json`;

if (!existsSync(ownershipFile)) {
    warn(`${ownershipFile} is missing - nothing records which reviewer owns which rule anchor`);
} else {
    let owners = {};
    try {
        owners = JSON.parse(read(ownershipFile)).owners || {};
    } catch (e) {
        fail(`${ownershipFile}: not valid JSON - ${e.message}`);
    }

    // Config-specific, and therefore this file's: doc-lint knows the doc tree, not the axis list.
    for (const axis of Object.keys(owners)) {
        if (!cfg.axes.some((a) => a.name === axis)) fail(`${ownershipFile}: "${axis}" is not an axis in ${cfg.file}`);
    }
    for (const axis of cfg.axes) {
        if (!(axis.name in owners)) warn(`${ownershipFile}: no entry for the "${axis.name}" axis - it can cite no rule, so it can never report a blocking finding with an anchor`);
    }

    if (DELEGATE) {
        ok(`${ownershipFile}: axis names match ${cfg.file} (anchors and "You own" blocks: ${LINT})`);
    } else {
        // No doc-lint installed: fall back to the subset that matters most, so a review-only
        // install is not left with nothing checking its anchors.
        const ANCHOR = /\b([A-Za-z0-9._/-]+\.md)#([a-z0-9-]+)\b/g;
        const resolve = (path) => [`${cfg.docsRoot}/${path}`, path].find((p) => existsSync(p));
        const anchorsOf = (file) => {
            const out = new Set();
            for (const m of read(file).matchAll(/^#{1,6}\s+(\S.*)$/gm)) {
                const explicit = m[1].match(/\{#([a-z0-9-]+)\}\s*$/);
                if (explicit) out.add(explicit[1]);
                out.add(m[1].replace(/\{#[a-z0-9-]+\}\s*$/, "").trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-"));
            }
            return out;
        };
        const cache = new Map();
        const anchorProblem = (ref) => {
            const [path, id] = ref.split("#");
            const file = resolve(path);
            if (!file) return `no such file: ${path}`;
            if (!cache.has(file)) cache.set(file, anchorsOf(file));
            return cache.get(file).has(id) ? null : `${file} has no anchor #${id}`;
        };

        const owner = new Map();
        for (const [axis, anchors] of Object.entries(owners)) {
            for (const ref of anchors) {
                if (owner.has(ref)) fail(`${ownershipFile}: ${ref} is owned by both ${owner.get(ref)} and ${axis}`);
                else owner.set(ref, axis);
                // Only `doc.md#anchor` ids resolve to a heading. A filed-rule path or a glob is
                // the corpus's business, and doc-lint is what checks it.
                if (!/^[A-Za-z0-9._/-]+\.md#[a-z0-9-]+$/.test(ref)) continue;
                const problem = anchorProblem(ref);
                if (problem) fail(`${ownershipFile}: ${ref} - ${problem}`);
            }
        }
        ok(`${ownershipFile}: ${owner.size} anchors, one owner each`);

        for (const axis of cfg.axes) {
            const file = agentFile(axis.name);
            if (!existsSync(file)) continue;
            const block = read(file).match(/##\s+You own[ \t]*\n+```([\s\S]*?)```/);
            if (!block) {
                warn(`${file}: no "## You own" block - the reviewer has no listed anchors`);
                continue;
            }
            const owned = new Set(owners[axis.name] || []);
            for (const m of block[1].matchAll(ANCHOR)) {
                const ref = `${m[1]}#${m[2]}`;
                if (!owned.has(ref)) fail(`${file} claims ${ref}, which ${ownershipFile} does not give it`);
            }
        }
        warn(`doc-lint is not installed - anchors were checked shallowly here. Install it for the full tree: ${LINT}`);
    }
}

// ---------------------------------------------------------------- unfinished install
// The install ships placeholders on purpose. Left in, they are a reviewer that was never told
// what this repo is - which reads, in the review, as a reviewer that found nothing.
let unfinished = 0;
for (const name of [...cfg.axes.map((a) => a.name), cfg.integration.agent]) {
    const file = agentFile(name);
    if (!existsSync(file)) continue;
    const todos = (read(file).match(/review-kit:todo/g) || []).length;
    if (todos) {
        unfinished++;
        warn(`${file}: ${todos} unfilled review-kit:todo marker(s) - this axis has no local knowledge yet`);
    }
}
const contract = `${cfg.docsRoot}/review-contract.md`;
if (existsSync(contract) && /Fill this in at install time/.test(read(contract))) {
    unfinished++;
    warn(`${contract}: the repo-specific blocks are still the shipped placeholder`);
}

// ---------------------------------------------------------------- the workflow
const wf = ".github/workflows/pull-request-review-pipeline.yml";
if (!existsSync(wf)) {
    warn(`${wf} is missing - the pipeline can only be run locally with /review-pr`);
} else {
    const body = read(wf);
    if (!body.includes(cfg.trigger))
        fail(`${wf} does not mention the trigger "${cfg.trigger}" from ${cfg.file} - they have drifted apart`);
    if (!/permissions:\s*\{\}/.test(body)) warn(`${wf}: no top-level \`permissions: {}\` - jobs inherit write scopes`);
    ok(`${wf}: triggered by "${cfg.trigger}"`);
}

// ---------------------------------------------------------------- the run directory
const ignore = existsSync(".gitignore") ? read(".gitignore") : "";
if (!ignore.split("\n").some((l) => l.trim().replace(/\/$/, "") === cfg.reviewDir.replace(/\/$/, "")))
    warn(`${cfg.reviewDir}/ is not in .gitignore - a local run would offer to commit itself`);

// ---------------------------------------------------------------- delegated tree checks
if (DELEGATE && process.argv.includes("--all")) {
    try {
        execFileSync(process.execPath, [LINT], { stdio: "inherit" });
        ok(`${LINT}: clean`);
    } catch {
        // Mid-onboarding, doc-lint's findings are the decisions still to be made - a rule nobody
        // owns yet is the install being unfinished, not the pipeline being broken. Once the agent
        // files carry local knowledge, the same findings mean drift, and drift is fatal.
        if (unfinished) warn(`${LINT} reported findings, but this install is not finished yet - not fatal until it is`);
        else fail(`${LINT} reported findings - run it and read them`);
    }
} else if (DELEGATE) {
    notes.push(`the doc tree is checked separately: node ${LINT}   (or --all to run both)`);
}

// ---------------------------------------------------------------- report
if (!quiet) for (const n of notes) console.log(`  ok    ${n}`);
for (const w of warnings) console.log(`  warn  ${w}`);
for (const e of errors) console.error(`  ERROR ${e}`);

let summary;
if (errors.length) {
    summary = `${errors.length} error(s), ${warnings.length} warning(s)`;
} else if (warnings.length) {
    summary = `ok, ${warnings.length} warning(s)`;
} else {
    summary = "ok";
}
console.log(`\nreview-doctor: ${summary}`);
process.exit(errors.length ? 1 : 0);
