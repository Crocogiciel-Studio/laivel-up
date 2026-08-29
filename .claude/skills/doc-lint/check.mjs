#!/usr/bin/env node
// Invariant checker for the agent documentation tree.
//
//   node .claude/skills/doc-lint/check.mjs           human-readable
//   node .claude/skills/doc-lint/check.mjs --json    machine-readable
//
// Read-only. Every finding is labelled `fix` (one correct answer) or `ask` (needs a decision).
// Exit 1 if there is anything to report.
//
// This is the ONE authority on the doc tree's invariants: anchors defined and owned, references
// resolving, agents pinned, no stray edit damage. review-doctor.js checks whether the review
// pipeline is wired and defers these to this file - one invariant, one checker, for the same
// reason a rule anchor has one owner.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";

const F = [];
const add = (kind, klass, file, msg, hint) => F.push({ kind, class: klass, file, msg, hint });
const fix = (...a) => add("fix", ...a);
const ask = (...a) => add("ask", ...a);

const read = (p) => readFileSync(p, "utf8");
const lsMd = (dir) =>
    existsSync(dir)
        ? readdirSync(dir)
              .filter((f) => f.endsWith(".md"))
              .map((f) => join(dir, f))
        : [];

// ---------------------------------------------------------------- where things live
// The review config is the authority when the review pipeline is installed; otherwise defaults.
let cfg = { docsRoot: "docs/agents", agentsRoot: ".claude/agents", skillsRoot: ".claude/skills" };
for (const c of [process.env.REVIEW_CONFIG, "docs/agents/review.config.json", ".review.config.json"]) {
    if (!c || !existsSync(c)) continue;
    try {
        cfg = { ...cfg, ...JSON.parse(read(c)) };
    } catch (e) {
        ask("parse", c, `does not parse as JSON: ${e.message}`);
    }
    break;
}
const DOCS = cfg.docsRoot;
const AGENTS_DIR = cfg.agentsRoot;
const SKILLS_DIR = cfg.skillsRoot || ".claude/skills";

// Process docs describe the machinery; they hold no reviewable rules, so their anchors are unowned
// by design.
const PROCESS_DOCS = new Set(["review-contract.md", "review-pipeline.md", "review-onboarding.md", "INDEX.md"]);
const MODELS = new Set(["fable", "opus", "sonnet", "haiku", "inherit"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "target", "vendor", "out", ".next", "coverage"]);

/** Scoped rule files - a CLAUDE.md or AGENTS.md anywhere that is not vendored output. */
function scopedRuleFiles(dir = ".", depth = 0, out = []) {
    if (depth > 4) return out;
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const full = join(dir, name);
        let st;
        try {
            st = statSync(full);
        } catch {
            continue;
        }
        if (st.isDirectory()) scopedRuleFiles(full, depth + 1, out);
        else if (name === "CLAUDE.md" || name === "AGENTS.md") out.push(relative(".", full));
    }
    return out;
}

const RULE_DOCS = lsMd(DOCS).filter((f) => !PROCESS_DOCS.has(basename(f)));
const AGENTS = lsMd(AGENTS_DIR);
const SKILLS = existsSync(SKILLS_DIR)
    ? readdirSync(SKILLS_DIR)
          .map((d) => join(SKILLS_DIR, d, "SKILL.md"))
          .filter((p) => existsSync(p))
    : [];
// A stub that only points elsewhere holds no rules and no anchors worth owning.
const SCOPED = scopedRuleFiles().filter((p) => !/deprecated|Do not update this file/i.test(read(p)));
const ALL_PROSE = [...lsMd(DOCS), ...AGENTS, ...SKILLS, ...SCOPED];

/** How a file is named in a ruleId: bare inside the docs root, repo-relative anywhere else. */
const anchorKey = (p) => (dirname(p) === DOCS ? basename(p) : p);
/** Anchor definitions only: what is inside an HTML comment or a code fence is an example. */
const stripExamples = (src) => src.replace(/<!--[\s\S]*?-->/g, "").replace(/^```[\s\S]*?^```/gm, "");
const anchorsIn = (p) => [...stripExamples(read(p)).matchAll(/\{#([a-z0-9-]+)\}/g)].map((m) => m[1]);
/** Where a `foo.md` or `dir/foo.md` reference resolves: docs-root first, then repo root. */
const resolveDoc = (t) => [join(DOCS, t), t].find((p) => existsSync(p));

// ---------------------------------------------------------------- A. parse
let own = null;
const schemaDir = join(DOCS, "schemas");
for (const p of [...(existsSync(schemaDir) ? readdirSync(schemaDir).map((f) => join(schemaDir, f)) : []), join(DOCS, "review-ownership.json")]) {
    if (!p.endsWith(".json") || !existsSync(p)) continue;
    try {
        const j = JSON.parse(read(p));
        if (p.endsWith("review-ownership.json")) own = j;
    } catch (e) {
        ask("parse", p, `does not parse as JSON: ${e.message}`);
    }
    for (const [, ref] of read(p).matchAll(/"\$ref":\s*"([^"#]+)#([^"]*)"/g)) {
        if (!existsSync(join(dirname(p), ref))) ask("parse", p, `$ref target missing: ${ref}`);
    }
}

const routingFile = join(DOCS, "routing.yml");
if (existsSync(routingFile)) {
    const y = read(routingFile);
    const keys = [...y.matchAll(/^([a-z][a-z0-9-]*):$/gm)].map((m) => m[1]);
    if (!keys.length) ask("parse", routingFile, "no task entries found - the file shape changed");
    for (const [, list] of y.matchAll(/^ {2}read: \[([^\]]*)\]/gm)) {
        for (const raw of list.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)) {
            if (!resolveDoc(raw)) ask("routing", routingFile, `read: target does not exist: ${raw}`);
        }
    }
    // An entry with no `read` sends a coding agent away with nothing, which is worse than no entry.
    for (const [, key, body] of y.matchAll(/^([a-z][a-z0-9-]*):\n((?:[ \t][^\n]*\n|\n(?=[ \t]))*)/gm)) {
        if (!/^[ \t]+task:/m.test(body)) ask("routing", routingFile, `entry "${key}" has no task: line - dev-context reads those as its menu`);
        if (!/^[ \t]+read:/m.test(body)) ask("routing", routingFile, `entry "${key}" has no read: list - it routes to nothing`);
        for (const [, glob] of body.matchAll(/(?:^|[[,]\s*)([A-Za-z0-9_./*-]*\/)\s*(?=[,\]])/g)) {
            ask("routing", routingFile, `entry "${key}" has a touch glob ending in a bare directory: ${glob} - add **`);
        }
    }
}

// ---------------------------------------------------------------- B. anchor registry
if (own) {
    const defined = new Set();
    for (const p of [...RULE_DOCS, ...SCOPED]) for (const a of anchorsIn(p)) defined.add(`${anchorKey(p)}#${a}`);

    // Docs whose anchors are cited but written as plain headings - declared, never assumed.
    const loose = new Set(own.looseAnchors || []);

    const listed = new Map();
    for (const [owner, list] of Object.entries(own.owners ?? {}))
        for (const a of list) {
            if (listed.has(a)) ask("ownership", join(DOCS, "review-ownership.json"), `${a} owned by both ${listed.get(a)} and ${owner}`);
            listed.set(a, owner);
        }
    for (const list of Object.values(own.excluded ?? {})) if (Array.isArray(list)) for (const a of list) listed.set(a, "(excluded)");

    const isAnchorId = (a) => /^[A-Za-z0-9._/-]+\.md#[a-z0-9-]+$/.test(a);
    for (const a of [...listed.keys()].filter(isAnchorId))
        if (!defined.has(a) && !loose.has(a.split("#")[0]))
            ask(
                "anchor",
                join(DOCS, "review-ownership.json"),
                `listed but not defined in any doc: ${a}`,
                "renamed or deleted - anchors are permanent, so this is usually a rename to revert",
            );
    for (const a of defined)
        if (!listed.has(a))
            ask("anchor", resolveDoc(a.split("#")[0]) || a.split("#")[0], `rule anchor owned by nobody: ${a}`,
                "assign it to one reviewer in review-ownership.json, or list it under excluded");

    // ------------------------------------------------------------ C. "You own" is a view
    for (const [owner, list] of Object.entries(own.owners ?? {})) {
        const p = join(AGENTS_DIR, `${owner}-reviewer.md`);
        if (!existsSync(p)) {
            ask("ownership", join(DOCS, "review-ownership.json"), `owner "${owner}" has no agent file at ${p}`);
            continue;
        }
        const src = read(p);
        if (!src.includes("## You own")) {
            if (list.length) ask("ownership", p, `owns ${list.length} anchors but has no "## You own" section`);
            continue;
        }
        const block = src.split("## You own")[1].match(/```\n([\s\S]*?)```/);
        const inFile = block ? block[1].split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("<!--")) : [];
        // An explicit comparator that reproduces the default lexicographic (code-unit) order.
        const want = [...list].sort((a, b) => (a > b) - (a < b));
        if (inFile.join("\n") !== want.join("\n"))
            fix(
                "ownership",
                p,
                `"You own" block does not match review-ownership.json`,
                `regenerate from the registry: ${want.length} anchors, sorted. missing=[${want.filter((a) => !inFile.includes(a))}] extra=[${inFile.filter((a) => !want.includes(a))}]`,
            );
    }
    for (const p of AGENTS) {
        const name = basename(p).replaceAll("-reviewer.md", "");
        if (name in (own.owners ?? {})) continue;
        const block = read(p).match(/##\s+You own[ \t]*\n+```([\s\S]*?)```/);
        if (block?.[1].trim())
            ask("ownership", p, `has a "You own" section but owns no anchors in the registry`);
    }
}

// ---------------------------------------------------------------- D. cross references
// A backtick-quoted path under the docs root or .claude, with a doc-ish extension.
const escDocs = DOCS.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const fileRefRe = new RegExp(
    "`((?:" + escDocs + String.raw`|\.claude)[A-Za-z0-9_./-]*\.(?:md|json|yml))` + "`",
    "g",
);
for (const p of ALL_PROSE) {
    const src = read(p);
    const local = new Set(anchorsIn(p));
    // The anchor charset is deliberately wide: a typo containing an uppercase letter or an
    // underscore must still be matched here, or the bad reference escapes the check entirely.
    for (const [, a] of src.matchAll(/`#([A-Za-z0-9_-]+)`/g))
        if (!/^\d+$/.test(a) && !local.has(a)) ask("ref", p, `local anchor \`#${a}\` is not defined in this file`);
    for (const [, target, a] of src.matchAll(/`([A-Za-z0-9_./-]+\.md)#([A-Za-z0-9_-]+)`/g)) {
        const t = resolveDoc(target);
        if (!t) {
            ask("ref", p, `reference to a file that does not exist: ${target}`);
            continue;
        }
        if (!anchorsIn(t).includes(a)) ask("ref", p, `${target}#${a} - file exists, anchor does not`);
    }
    for (const [, target] of src.matchAll(fileRefRe))
        if (!target.includes("*") && !existsSync(target)) ask("ref", p, `reference to a missing file: ${target}`);
}

// The index promises a map. A row pointing at a file that moved is the promise broken.
const indexFile = join(DOCS, "INDEX.md");
if (existsSync(indexFile)) {
    for (const row of read(indexFile).split("\n").filter((l) => l.trimStart().startsWith("|")))
        for (const [, target] of row.matchAll(/`([A-Za-z0-9_./-]+\.(?:md|json|yml))`/g))
            if (!target.includes("*") && !resolveDoc(target)) ask("index", indexFile, `row points at a file that does not exist: ${target}`);
}

// ---------------------------------------------------------------- D2. the rule corpus
// Filed rules - one rule per file, scope in its own frontmatter - are usually GENERATED, by AIDD
// or by a per-tool rule surface. Nothing here proposes an edit inside them: they would be
// overwritten on the next regeneration, exactly like generated code is never a review topic. What
// is checked is the seam between the corpus and this repo's own registry, which is where a
// regeneration actually breaks something.
const corpusScript = ".github/scripts/review-corpus.js";
if (own && existsSync(corpusScript)) {
    try {
        const req = createRequire(import.meta.url);
        const corpus = req(resolve(corpusScript));
        const entries = corpus.rules().filter((r) => r.kind !== "memory");
        const owners = own.owners ?? {};
        const registry = join(DOCS, "review-ownership.json");
        // An anchor listed under `excluded` belongs to nobody on purpose. Section B honours that;
        // this one has to as well, or a deliberate decision reads as an omission.
        const exempt = Object.values(own.excluded ?? {}).filter(Array.isArray).flat();
        const isExempt = (id) => exempt.some((p) => p === id || corpus.matches(p, id));

        for (const r of entries) {
            const axes = corpus.ownerOf(r.id, owners);
            if (axes.length > 1) ask("ownership", registry, `${r.id} is matched by ${axes.join(" and ")} - two reviewers would comment on the same rule`);
            else if (!axes.length && !isExempt(r.id))
                ask("ownership", registry, `rule owned by nobody: ${r.id}`,
                    "assign it to one axis - a pattern like \".claude/rules/<category>/**\" survives a regeneration, one line per file does not");
        }

        // The drift signal that matters: the corpus was regenerated and an entry now matches nothing.
        for (const [axis, patterns] of Object.entries(owners))
            for (const pat of patterns) {
                if (/^[A-Za-z0-9._/-]+\.md#[a-z0-9-]+$/.test(pat)) continue; // an anchor, checked above
                if (!entries.some((r) => r.id === pat || corpus.matches(pat, r.id)) && !isExempt(pat))
                    ask("anchor", registry, `${axis} owns "${pat}", which now matches no rule`,
                        "the corpus moved or was regenerated - repoint the pattern, or drop it if the rule is gone");
            }

        if (!entries.length && (own.owners && Object.values(own.owners).some((l) => l.length)))
            ask("parse", corpusScript, "the ownership registry has entries but the corpus resolved to nothing - check corpus.sources in the review config");
    } catch (e) {
        // A repo can run this checker without the review pipeline configured. That is not a defect;
        // a config that exists and does not load is.
        if (!/no review config found/.test(e.message)) ask("parse", corpusScript, `could not resolve the corpus: ${e.message}`);
    }
}

// ---------------------------------------------------------------- E. frontmatter
for (const p of [...AGENTS, ...SKILLS]) {
    const src = read(p);
    if (!src.startsWith("---\n")) {
        ask("frontmatter", p, "no YAML frontmatter");
        continue;
    }
    const fm = src.slice(4, src.indexOf("\n---\n", 4));
    const get = (k) => (fm.match(new RegExp(String.raw`^${k}:\s*(.+)$`, "m")) ?? [])[1]?.trim();
    if (!get("name")) ask("frontmatter", p, "missing name:");
    if (!get("description")) ask("frontmatter", p, "missing description:");
    if (p.startsWith(AGENTS_DIR)) {
        const m = get("model");
        const e = get("effort");
        if (!m) ask("frontmatter", p, "no model: - the run is not reproducible", "pin it, see review-pipeline.md#models");
        else if (!MODELS.has(m)) ask("frontmatter", p, `model: "${m}" is not a known alias`, `valid: ${[...MODELS].join(" ")}`);
        if (!e) ask("frontmatter", p, "no effort: - the run is not reproducible", "pin it, see review-pipeline.md#models");
        else if (!EFFORTS.has(e) && !/^\d+$/.test(e)) ask("frontmatter", p, `effort: "${e}" is not valid`, `valid: ${[...EFFORTS].join(" ")} or an integer`);
        if (!get("tools")) ask("frontmatter", p, "no tools: - the agent inherits everything");
    }
}

// ---------------------------------------------------------------- F. stray edit damage
for (const p of ALL_PROSE) {
    read(p)
        .split("\n")
        .forEach((l, i) => {
            const n = i + 1;
            const junk = l.match(/^#{1,6} .*\{#[a-z0-9-]+\}(.+)$/);
            if (junk?.[1].trim())
                fix("stray", p, `line ${n}: content after the anchor on a heading: "${junk[1].trim()}"`, "delete the trailing text - it breaks the anchor");
            if (/^#{1,6} .*[ \t]$/.test(l)) fix("stray", p, `line ${n}: trailing whitespace on a heading`, "trim it");
            if (/\{#[A-Z_]/.test(l)) fix("stray", p, `line ${n}: anchor is not lowercase-kebab`, "anchors are [a-z0-9-]");
        });
    const fences = (read(p).match(/^```/gm) ?? []).length;
    if (fences % 2) ask("stray", p, `odd number of \`\`\` fences (${fences}) - one is unclosed, or a nested fence needs four backticks`);
}

// ---------------------------------------------------------------- report
if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ fix: F.filter((f) => f.kind === "fix"), ask: F.filter((f) => f.kind === "ask") }, null, 2));
} else {
    for (const [kind, label] of [["fix", "AUTO-FIX - one correct answer"], ["ask", "NEEDS A DECISION"]]) {
        const g = F.filter((f) => f.kind === kind);
        console.log(`\n${label}: ${g.length}`);
        for (const f of g) {
            console.log(`  [${f.class}] ${f.file}`);
            console.log(`      ${f.msg}`);
            if (f.hint) console.log(`      → ${f.hint}`);
        }
    }
    console.log(`\nscanned ${ALL_PROSE.length} prose files, ${AGENTS.length} agents, ${SKILLS.length} skills`);
    console.log(F.length ? `${F.length} findings` : "clean");
}
process.exit(F.length ? 1 : 0);
