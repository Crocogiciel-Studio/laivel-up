#!/usr/bin/env node
// The rule corpus, whoever wrote it.
//
//   require('./.github/scripts/review-corpus.js').rules()        every rule, normalised
//   require('./.github/scripts/review-corpus.js').match(files)   the rules a diff engages
//   node .github/scripts/review-corpus.js                        print the inventory
//   node .github/scripts/review-corpus.js --match a.ts b.java    print what those files engage
//
// Two shapes of corpus exist and the difference matters:
//
//   anchored  one doc, many rules, each a heading with a permanent {#anchor}, cited as
//             `doc.md#anchor`. Hand-written; the kit's own default.
//   filed     one rule per file, its scope declared in its own frontmatter, cited as its path.
//             This is what AIDD and the per-tool rule surfaces (.claude/rules, .cursor/rules,
//             .github/instructions) produce, and those files are GENERATED: nothing here writes
//             to them, ever.
//
// A filed rule already carries the globs it applies to. That is the useful part: the run can work
// out which rules a diff engages without asking a model, and hand them to the reviewers rather
// than hoping they go looking.

const { readFileSync, existsSync, readdirSync, statSync } = require("node:fs");
const { join, relative, basename } = require("node:path");
const config = require("./review-config.js");

// Where each tool keeps its rules, and which frontmatter field carries the scope.
// Add a surface here, never as a second copy of this table.
const SURFACES = [
    { tool: "claude", dir: ".claude/rules", ext: ".md", scope: ["paths"] },
    { tool: "cursor", dir: ".cursor/rules", ext: ".mdc", scope: ["globs"] },
    { tool: "copilot", dir: ".github/instructions", ext: ".instructions.md", scope: ["applyTo"] },
    { tool: "opencode", dir: ".opencode/rules", ext: ".md", scope: [] },
];

/**
 * A glob, as these tools mean it.
 *
 * `**` crosses directories and may match nothing at all, `*` stops at a slash, `{a,b}` alternates.
 * A pattern with no slash matches the basename at any depth: `*.py` is how every one of these
 * tools writes an all-python rule, and read literally it would only match the repo root.
 */
const esc = (s) => s.replace(/[.+^$()|[\]\\*?{}]/g, String.raw`\$&`);

/** One glob token at position `i`: what to append to the regex source, and how far to advance. */
function globToken(src, i) {
    const c = src[i];
    if (c === "*" && src[i + 1] === "*" && src[i + 2] === "/") return ["(?:.*/)?", 3]; // any depth, incl. none
    if (c === "*" && src[i + 1] === "*") return [".*", 2];
    if (c === "*") return ["[^/]*", 1];
    if (c === "?") return ["[^/]", 1];
    if (c === "{") {
        const end = src.indexOf("}", i);
        if (end === -1) return [String.raw`\{`, 1];
        const alts = src.slice(i + 1, end).split(",").map((s) => esc(s.trim())).join("|");
        return [`(?:${alts})`, end - i + 1];
    }
    if (".+^$()|[]\\".includes(c)) return [`\\${c}`, 1];
    return [c, 1];
}

function globToRegExp(glob) {
    const g = glob.trim();
    const src = g.includes("/") ? g : `**/${g}`;
    let out = "";
    let i = 0;
    while (i < src.length) {
        const [chunk, advance] = globToken(src, i);
        out += chunk;
        i += advance;
    }
    return new RegExp(`^${out}$`);
}

const matches = (glob, file) => globToRegExp(glob).test(file.replace(/^\.\//, ""));

function frontmatter(src) {
    if (!src.startsWith("---")) return {};
    const end = src.indexOf("\n---", 3);
    if (end === -1) return {};
    const out = {};
    for (const line of src.slice(3, end).split("\n")) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/);
        if (!m) continue;
        let v = m[2].trim().replace(/^["']|["']$/g, "");
        if (v.startsWith("[") && v.endsWith("]"))
            v = v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
        out[m[1]] = v;
    }
    return out;
}

/** Every scope glob a rule declares, whichever tool's field name it used. */
function scopeGlobs(fm, fields) {
    const out = [];
    for (const f of fields) {
        const v = fm[f];
        if (!v) continue;
        for (const g of Array.isArray(v) ? v : String(v).split(",")) if (g.trim()) out.push(g.trim());
    }
    // No declared scope means the rule applies everywhere - what `alwaysApply: true` encodes too.
    return out.length ? out : ["**"];
}

function walk(dir, ext, { recursive = true, exclude = [] } = {}, out = []) {
    if (!dir || !existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            if (recursive) walk(full, ext, { recursive, exclude }, out);
        } else if (name.endsWith(ext) && !exclude.some((g) => matches(g, full))) {
            out.push(full);
        }
    }
    return out;
}

const title = (src) => (src.match(/^#\s+(\S.*)$/m) || [])[1]?.replace(/\{#[a-z0-9-]+\}\s*$/, "").trim();
/** Anchors a doc defines, ignoring examples inside comments and code fences. */
const anchorsOf = (src) =>
    [...src.replace(/<!--[\s\S]*?-->/g, "").replace(/^```[\s\S]*?^```/gm, "").matchAll(/\{#([a-z0-9-]+)\}/g)].map((m) => m[1]);

let cached;

/** `kind: "rules"` - a named tool surface, or an explicit dir plus the field its scope lives in. */
function rulesFromSurface(src) {
    const surface = SURFACES.find((s) => s.tool === src.tool) || {};
    const dir = src.dir || surface.dir;
    const ext = src.ext || surface.ext || ".md";
    const fields = src.scopeField ? [src.scopeField] : surface.scope || [];
    return walk(dir, ext).map((file) => {
        const raw = readFileSync(file, "utf8");
        const fm = frontmatter(raw);
        return {
            id: file,
            kind: "rule",
            source: src.tool || dir,
            generated: src.generated !== false,
            title: title(raw) || basename(file, ext),
            description: fm.description || "",
            appliesTo: scopeGlobs(fm, fields),
        };
    });
}

/**
 * `kind: "anchored"` - one doc, many rules, each a heading with a permanent {#anchor}.
 *
 * Non-recursive by default: an anchored corpus is one flat directory of rule docs, and descending
 * would pick up the templates, whose anchors are examples. This must agree with doc-lint's own
 * scan, or the two disagree about what a rule even is.
 */
function rulesFromAnchored(src) {
    const opts = { recursive: src.recursive === true, exclude: src.exclude || [] };
    const out = [];
    for (const file of walk(src.dir, ".md", opts)) {
        const raw = readFileSync(file, "utf8");
        const key = src.bareNames === false ? file : relative(src.dir, file);
        for (const a of anchorsOf(raw))
            out.push({
                id: `${key}#${a}`,
                kind: "anchor",
                source: src.dir,
                generated: src.generated === true,
                title: a,
                description: "",
                appliesTo: src.appliesTo || ["**"],
            });
    }
    return out;
}

/** `kind: "memory"` - background docs, not rules; carried so the reviewers can be handed context. */
function rulesFromMemory(src) {
    const opts = { recursive: src.recursive !== false, exclude: src.exclude || [] };
    return walk(src.dir, ".md", opts).map((file) => {
        const raw = readFileSync(file, "utf8");
        return {
            id: file,
            kind: "memory",
            source: src.dir,
            generated: src.generated !== false,
            title: title(raw) || basename(file, ".md"),
            description: "",
            appliesTo: src.appliesTo || ["**"],
        };
    });
}

const BY_KIND = { rules: rulesFromSurface, anchored: rulesFromAnchored, memory: rulesFromMemory };

/** Every rule in the repo, from every configured source, normalised to one shape. */
function rules() {
    if (cached) return cached;
    const corpus = config().corpus || {};
    const out = [];
    for (const src of corpus.sources || []) {
        const collect = BY_KIND[src.kind];
        if (collect) out.push(...collect(src));
    }
    cached = out;
    return out;
}

/**
 * The rules a set of changed files engages.
 *
 * `all: false` drops the rules that apply everywhere - readable in a report, wrong for a reviewer:
 * a rule scoped to `**` is still a rule.
 */
function match(files, { all = true } = {}) {
    return rules()
        .filter((r) => r.kind !== "memory")
        .map((r) => ({ ...r, matched: files.filter((f) => r.appliesTo.some((g) => matches(g, f))) }))
        .filter((r) => r.matched.length && (all || !r.appliesTo.includes("**")));
}

/**
 * Which axis owns a rule id, from review-ownership.json.
 *
 * An entry is an exact id or a glob, so a generated corpus can be assigned by category
 * (`.claude/rules/03-security/**`) instead of one line per file that a regeneration will move.
 * Two owners matching the same id is a defect, not a precedence question: doc-lint reports it and
 * nothing here silently picks a winner.
 */
function ownerOf(id, owners) {
    const hit = [];
    for (const [axis, patterns] of Object.entries(owners || {}))
        for (const p of patterns) if (p === id || matches(p, id)) hit.push(axis);
    return [...new Set(hit)];
}

module.exports = { rules, match, matches, ownerOf, globToRegExp, SURFACES };

if (require.main === module) {
    const i = process.argv.indexOf("--match");
    if (i !== -1) {
        const files = process.argv.slice(i + 1);
        const hits = match(files);
        for (const r of hits) console.log(`${r.id}\n    ${r.title}\n    applies to ${r.appliesTo.join(", ")} -> ${r.matched.join(", ")}`);
        console.log(`\n${hits.length} rule(s) engaged by ${files.length} file(s)`);
    } else {
        const all = rules();
        for (const r of all) console.log(`${r.kind.padEnd(6)} ${r.id}  [${r.appliesTo.join(" ")}]`);
        console.log(`\n${all.length} entries from ${new Set(all.map((r) => r.source)).size} source(s)`);
    }
}
