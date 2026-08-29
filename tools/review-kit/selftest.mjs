#!/usr/bin/env node
// Prove the kit still works, without spending a token on a model.
//
//   node review-kit/selftest.mjs
//
// Installs into a throwaway directory, runs the doctor, then drives stages 1, 4 and 5 against a
// fake GitHub API: real scripts, invented pull request. Asserts the properties that would
// otherwise only fail in front of a reviewer - the merge base, the exclusions, the anchorable
// ranges, the routing, the ids, and a finding off a changed line landing in the body rather than
// being dropped.

import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The harness runs inside the installed repo, so it requires the scripts exactly as CI does.
const HARNESS = String.raw`
const { readFileSync, writeFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
process.env.PR_NUMBER = "42";
process.env.REVIEW_KEY = "pr-42";

const files = [
  { filename: "src/main/OrderService.java", status: "modified", additions: 10, deletions: 2,
    patch: "@@ -10,3 +10,5 @@\n c\n+one\n+two\n c\n@@ -40,2 +41,1 @@\n-gone\n c" },
  { filename: "src/gen/ApiClient.java", status: "modified", additions: 900, deletions: 3, patch: "@@ -1,1 +1,2 @@\n+x" },
  { filename: "pnpm-lock.yaml", status: "modified", additions: 90, deletions: 3, patch: "@@ -1,1 +1,2 @@\n+y" },
];
const posted = [];
const github = {
  rest: {
    pulls: {
      get: async () => ({ data: { title: "Add order status", body: "Adds a status column.", head: { sha: "head-sha" }, base: { ref: "main" } } }),
      listFiles: "listFiles",
      createReview: async (r) => posted.push(r),
    },
    repos: { compareCommits: async () => ({ data: { merge_base_commit: { sha: "merge-base-sha" } } }) },
    checks: { listForRef: "checks" },
  },
  paginate: async (w) => (w === "listFiles" ? files : [{ name: "build", status: "completed", conclusion: "success", details_url: "x" }]),
};
const out = {};
const core = { info() {}, notice() {}, warning() {}, setFailed() {}, setOutput: (k, v) => { out[k] = v; },
  summary: { addRaw() { return this; }, async write() {} } };
const context = { repo: { owner: "o", repo: "r" }, runId: 1 };

(async () => {
  await require("./.github/scripts/review-context.js")({ github, context, core });
  const run = () => JSON.parse(readFileSync(".review/pr-42/run.json", "utf8"));
  const input = JSON.parse(readFileSync(".review/pr-42/in/input.json", "utf8"));

  writeFileSync(".review/pr-42/general.json", JSON.stringify({ findings: [
    { severity: "blocking", file: "src/main/OrderService.java", line: 11, description: "Null status crashes the mapper.", evidence: "map(status)", confidence: "confirmed" },
    { severity: "nit", file: "src/main/OrderService.java", line: 999, description: "name", evidence: "x", confidence: "plausible" },
  ], skipped: [] }));
  writeFileSync(".review/pr-42/complexity.json", JSON.stringify({ findings: [
    { severity: "nit", file: "src/main/OrderService.java", line: 12, description: "inline this", suggestion: "\u0060\u0060\u0060suggestion\nreturn x;\n\u0060\u0060\u0060", evidence: "var y = x;", confidence: "confirmed" },
  ] }));
  for (const a of ["general", "complexity"]) execFileSync(process.execPath, [".github/scripts/review-check.js", a, "pr-42"]);
  await require("./.github/scripts/review-merge.js")({ core });
  writeFileSync(".review/pr-42/integration.json", JSON.stringify({ summary: "1 blocking, 0 important, 2 nits.", duplicates: [] }));
  await require("./.github/scripts/review-publish.js")({ github, context, core });

  const merged = JSON.parse(readFileSync(".review/pr-42/merged.json", "utf8"));
  process.stdout.write(JSON.stringify({
    base: input.base,
    inScope: input.files.map((f) => f.file),
    excluded: run().excluded,
    ranges: input.files[0].lines,
    agents: run().agents,
    intent: input.intent.title,
    matrix: JSON.parse(out.matrix),
    ids: merged.findings.map((f) => f.id),
    failedAxes: run().failedAxes,
    inline: posted[0].comments.map((c) => c.body),
    body: posted[0].body,
  }));
})();
`;

const CORPUS_HARNESS = String.raw`
const { readFileSync, writeFileSync } = require("node:fs");
process.env.PR_NUMBER = "7";
const files = [
  { filename: "src/api/Orders.ts", status: "modified", additions: 5, deletions: 1, patch: "@@ -1,2 +1,3 @@\n c\n+one" },
  { filename: "src/ui/Button.tsx", status: "modified", additions: 5, deletions: 1, patch: "@@ -1,2 +1,3 @@\n c\n+two" },
];
const github = {
  rest: {
    pulls: { get: async () => ({ data: { title: "t", body: "b", head: { sha: "h" }, base: { ref: "main" } } }), listFiles: "listFiles" },
    repos: { compareCommits: async () => ({ data: { merge_base_commit: { sha: "mb" } } }) },
    checks: { listForRef: "checks" },
  },
  paginate: async (w) => (w === "listFiles" ? files : []),
};
const warnings = [];
const core = { info() {}, notice() {}, warning: (m) => warnings.push(m), setFailed() {}, setOutput() {}, summary: { addRaw() { return this; }, async write() {} } };
(async () => {
  await require("./.github/scripts/review-context.js")({ github, context: { repo: { owner: "o", repo: "r" }, runId: 1 }, core });
  const input = JSON.parse(readFileSync(".review/pr-7/in/input.json", "utf8"));
  const run = JSON.parse(readFileSync(".review/pr-7/run.json", "utf8"));
  process.stdout.write(JSON.stringify({ rules: input.rules || [], unowned: run.rules ? run.rules.unowned : [], warnings }));
})();
`;

const KIT = dirname(fileURLToPath(import.meta.url));
const REPO = mkdtempSync(join(tmpdir(), "review-kit-selftest-"));
let failures = 0;
const check = (label, ok, detail = "") => {
    const suffix = ok || !detail ? "" : ` — ${detail}`;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${suffix}`);
    if (!ok) failures++;
};

try {
    execFileSync(process.execPath, [join(KIT, "install.mjs"), "--target", REPO, "--no-vendor"], { encoding: "utf8" });
    console.log(`installed into ${REPO}\n`);

    // A repo-shaped config, as the onboarding phase would leave it.
    const cfgPath = join(REPO, "docs/agents/review.config.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    cfg.exclude.unshift({ pattern: "^src/gen/", reason: "generated client" });
    cfg.axes.push(
        { name: "security", prefix: "sec", route: String.raw`(Service|Repository)\.java$` },
        { name: "api", prefix: "api", route: "^src/gen/", routeIncludesExcluded: true },
    );
    writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
    for (const a of ["security", "api"]) {
        writeFileSync(
            join(REPO, `.claude/agents/${a}-reviewer.md`),
            `---\nname: ${a}-reviewer\ndescription: test\ntools: Read\nmodel: opus\neffort: high\n---\n\n# ${a}\n\n## You own\n\n\`\`\`\n\`\`\`\n`,
        );
    }

    const doctor = execFileSync(process.execPath, [".github/scripts/review-doctor.js", "--quiet"], { cwd: REPO, encoding: "utf8" });
    check("the doctor passes a configured install", !/ERROR/.test(doctor), doctor.trim());

    // The corpus half: installed, clean out of the box, and owned by one checker.
    let lint;
    try {
        lint = execFileSync(process.execPath, [".claude/skills/doc-lint/check.mjs"], { cwd: REPO, encoding: "utf8" });
    } catch (e) {
        lint = e.stdout || "";
    }
    check("doc-lint is clean on a fresh install", (lint.trim() + "\n").endsWith("\nclean") || /^clean$/m.test(lint), lint.trim().split("\n").slice(-6).join(" | "));
    const full = execFileSync(process.execPath, [".github/scripts/review-doctor.js"], { cwd: REPO, encoding: "utf8" });
    check("the doctor defers the doc tree to doc-lint", /anchors and "You own" blocks: \.claude\/skills\/doc-lint/.test(full));
    check("the corpus is installed: routing table, index, glossary", ["docs/agents/routing.yml", "docs/agents/INDEX.md", "docs/agents/glossary.md"].every((f) => existsSync(join(REPO, f))));

    // A doc defect must be caught, not passed over: rename an owned anchor and re-run.
    const sec = join(REPO, "docs/agents/security.md");
    writeFileSync(sec, "# Security\n\n## Tenant scoping {#tenant-scoping}\n\nFilter by tenant.\n");
    const ownPath = join(REPO, "docs/agents/review-ownership.json");
    const reg = JSON.parse(readFileSync(ownPath, "utf8"));
    reg.owners.security = ["security.md#tenant-scoping", "security.md#renamed-away"];
    writeFileSync(ownPath, JSON.stringify(reg, null, 2));
    let broken;
    try {
        broken = execFileSync(process.execPath, [".claude/skills/doc-lint/check.mjs"], { cwd: REPO, encoding: "utf8" });
    } catch (e) {
        broken = e.stdout || "";
    }
    check("doc-lint catches an anchor listed but not defined", /listed but not defined/.test(broken));
    check("doc-lint catches a \"You own\" block out of sync", /"You own" block does not match/.test(broken));

    writeFileSync(join(REPO, "harness.cjs"), HARNESS);
    const out = execFileSync(process.execPath, ["harness.cjs"], { cwd: REPO, encoding: "utf8" });
    const r = JSON.parse(out);

    check("the merge base is used, not the base branch tip", r.base === "merge-base-sha");
    check("excluded files never reach a reviewer", !r.inScope.includes("src/gen/ApiClient.java") && !r.inScope.includes("pnpm-lock.yaml"));
    check("exclusions are recorded with a reason", r.excluded.length === 2 && r.excluded.every((e) => e.reason));
    check("anchorable ranges come from the hunk headers", JSON.stringify(r.ranges) === "[[10,14],[41,41]]");
    check("always-axes run", r.agents.includes("general") && r.agents.includes("complexity"));
    check("a routed axis runs on its path", r.agents.includes("security"));
    check("routeIncludesExcluded routes on an excluded path", r.agents.includes("api"));
    check("the intent reaches the reviewers", r.intent === "Add order status");
    check("model and effort come from the agent files", r.matrix.every((m) => m.model && m.effort));
    check("ids are minted from the axis prefixes", JSON.stringify(r.ids) === '["gen-1","gen-2","cx-1"]');
    check("an axis that produced nothing is reported as failed", r.failedAxes.includes("security"));
    check("findings on changed lines are posted inline", r.inline.length === 2);
    check("a finding off a changed line goes in the body, not the bin", /not on a changed line/.test(r.body));
    check("the integration summary is the body, verbatim", r.body.startsWith("1 blocking, 0 important, 2 nits."));
    check("coverage states what was not reviewed", /Not reviewed/.test(r.body) && /No output from/.test(r.body));
    check("a suggestion block survives untouched", r.inline.some((c) => c.includes("```suggestion")));
    // ---------------------------------------------------------------- a generated corpus
    // The AIDD shape: one rule per file, its scope in its own frontmatter, nothing hand-written.
    const AIDD = mkdtempSync(join(tmpdir(), "review-kit-aidd-"));
    try {
        const rule = (path, fm, title) => {
            mkdirSync(dirname(join(AIDD, path)), { recursive: true });
            writeFileSync(join(AIDD, path), `---\n${fm}\n---\n\n# ${title}\n\nBody.\n`);
        };
        rule(".claude/rules/01-standards/1-no-console.md", 'paths: ["**/*.ts", "**/*.tsx"]', "No console.log");
        rule(".claude/rules/03-security/1-tenant.md", 'paths: ["src/api/**"]', "Scope by tenant");
        mkdirSync(join(AIDD, "aidd_docs/memory"), { recursive: true });
        writeFileSync(join(AIDD, "aidd_docs/memory/architecture.md"), "# Architecture\n\nTwo tiers.\n");

        execFileSync(process.execPath, [join(KIT, "install.mjs"), "--target", AIDD, "--corpus", "aidd", "--no-vendor"], { encoding: "utf8" });

        check("aidd mode scaffolds no routing table into a generated corpus", !existsSync(join(AIDD, "docs/agents/routing.yml")));
        check("aidd mode still installs doc-lint and dev-context", existsSync(join(AIDD, ".claude/skills/doc-lint/check.mjs")) && existsSync(join(AIDD, ".claude/skills/dev-context/SKILL.md")));

        const inv = execFileSync(process.execPath, [".github/scripts/review-corpus.js"], { cwd: AIDD, encoding: "utf8" });
        check("the corpus resolves generated rules and memory", /01-standards\/1-no-console\.md/.test(inv) && /memory\/architecture\.md/.test(inv));

        // Own by category pattern, the way a regenerated corpus has to be owned.
        const aCfg = JSON.parse(readFileSync(join(AIDD, "docs/agents/review.config.json"), "utf8"));
        aCfg.axes.push({ name: "security", prefix: "sec", route: "^src/api/" });
        writeFileSync(join(AIDD, "docs/agents/review.config.json"), JSON.stringify(aCfg, null, 2));
        writeFileSync(
            join(AIDD, ".claude/agents/security-reviewer.md"),
            "---\nname: security-reviewer\ndescription: t\ntools: Read\nmodel: opus\neffort: high\n---\n\n# security\n\n## You own\n\n```\n.claude/rules/03-security/**\n```\n",
        );
        const aOwn = JSON.parse(readFileSync(join(AIDD, "docs/agents/review-ownership.json"), "utf8"));
        aOwn.owners.security = [".claude/rules/03-security/**"];
        aOwn.owners.complexity = [".claude/rules/01-standards/**"];
        writeFileSync(join(AIDD, "docs/agents/review-ownership.json"), JSON.stringify(aOwn, null, 2));

        writeFileSync(join(AIDD, "corpus-harness.cjs"), CORPUS_HARNESS);
        const c = JSON.parse(execFileSync(process.execPath, ["corpus-harness.cjs"], { cwd: AIDD, encoding: "utf8" }));
        const byId = Object.fromEntries(c.rules.map((r) => [r.id, r]));
        check("the reviewer input carries the rules the diff engages", c.rules.length === 2, JSON.stringify(c.rules.map((r) => r.id)));
        check("a path-scoped rule matches only the files in its scope",
            byId[".claude/rules/03-security/1-tenant.md"]?.files.join() === "src/api/Orders.ts");
        check("an extension-scoped rule matches across directories",
            byId[".claude/rules/01-standards/1-no-console.md"]?.files.length === 2);
        check("each engaged rule names the axis that may cite it",
            byId[".claude/rules/03-security/1-tenant.md"]?.owners.join() === "security");

        // Ownership by pattern is what survives a regeneration; the drift must still be reported.
        renameSync(join(AIDD, ".claude/rules/03-security"), join(AIDD, ".claude/rules/04-security"));
        let drift;
        try {
            drift = execFileSync(process.execPath, [".claude/skills/doc-lint/check.mjs"], { cwd: AIDD, encoding: "utf8" });
        } catch (e) {
            drift = e.stdout || "";
        }
        check("a regenerated corpus that moved is reported from both sides",
            /which now matches no rule/.test(drift) && /rule owned by nobody/.test(drift));

        // The gate has two states on purpose: pending decisions during onboarding, drift after.
        const doctorAll = (cwd) => {
            try {
                return { code: 0, out: execFileSync(process.execPath, [".github/scripts/review-doctor.js", "--all"], { cwd, encoding: "utf8" }) };
            } catch (e) {
                return { code: e.status || 1, out: (e.stdout || "") + (e.stderr || "") };
            }
        };
        const unfinished = doctorAll(AIDD);
        check("an unfinished install does not fail the CI gate", unfinished.code === 0 && /not finished yet/.test(unfinished.out), unfinished.out.trim().split("\n").slice(-2).join(" | "));

        // Finish the install: no todo markers, no placeholder contract. Now drift must be fatal.
        for (const f of ["general", "complexity"]) {
            const file = join(AIDD, `.claude/agents/${f}-reviewer.md`);
            writeFileSync(file, readFileSync(file, "utf8").replace(/<!-- review-kit:todo[\s\S]*?-->/g, "(filled in)"));
        }
        const contract = join(AIDD, "docs/agents/review-contract.md");
        writeFileSync(contract, readFileSync(contract, "utf8").replaceAll('Fill this in at install time', "CI runs lint and typecheck"));
        const finished = doctorAll(AIDD);
        check("once the install is finished, corpus drift fails the gate", finished.code !== 0, `exit ${finished.code}`);
    } finally {
        rmSync(AIDD, { recursive: true, force: true });
    }
} catch (e) {
    failures++;
    console.error(`\nselftest crashed: ${e.stdout || ""}${e.message}`);
} finally {
    rmSync(REPO, { recursive: true, force: true });
}

console.log(failures ? `\nselftest: ${failures} failure(s)` : "\nselftest: ok");
process.exit(failures ? 1 : 0);
