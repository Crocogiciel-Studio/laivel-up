// Stage 5: one GitHub review, many comments. review-pipeline.md#publish is the contract.
//
//   require('./.github/scripts/review-publish.js')({ github, context, core })
//
// The only judgement here is where a finding goes: at the code, or in the body. GitHub refuses a
// comment on a line outside the diff and refuses the whole payload when one is wrong, so a
// finding is only posted inline if it sits in a range review-context.js already published in
// input.json. Nothing re-reads the diff.

const { readFileSync, existsSync } = require("node:fs");
const config = require("./review-config.js");

const LABEL = { blocking: "🔴 **blocking**", important: "🟠 **important**", nit: "🔵 **nit**" };
const RANK = { blocking: 0, important: 1, nit: 2 };

const location = (f) => {
    const span = f.endLine && f.endLine > f.line ? `${f.line}-${f.endLine}` : `${f.line}`;
    return `\`${f.file}:${span}\``;
};

const attribution = (f) =>
    [LABEL[f.severity], f.agent, f.ruleId && `\`${f.ruleId}\``, f.confidence === "plausible" && "_plausible_"]
        .filter(Boolean)
        .join(" · ");

/** One inline comment payload from a finding that has earned a spot at the code. */
function inlineComment(f) {
    const last = f.endLine && f.endLine > f.line ? f.endLine : f.line;
    return {
        path: f.file,
        side: "RIGHT",
        line: last,
        // start_line only for a real span: GitHub rejects a one-line range.
        ...(last > f.line ? { start_line: f.line, start_side: "RIGHT" } : {}),
        body: [attribution(f), "", f.description, ...(f.suggestion ? ["", f.suggestion] : [])].join("\n"),
    };
}

/** Where each finding goes: at the code, or in the body, with the reason it was not posted inline. */
function splitFindings(ordered, { postable, duplicates, nitsInline, maxComments }) {
    const comments = [];
    const inBody = [];
    let nits = 0;
    for (const f of ordered) {
        if (duplicates.has(f.id)) continue;
        if (!postable(f)) {
            inBody.push([f, "not on a changed line"]);
        } else if (f.severity === "nit" && nits >= nitsInline) {
            inBody.push([f, `past the first ${nitsInline} nits`]);
        } else if (comments.length >= maxComments) {
            inBody.push([f, `past the first ${maxComments} comments`]);
        } else {
            comments.push(inlineComment(f));
            if (f.severity === "nit") nits++;
        }
    }
    return { comments, inBody };
}

/** The "what was not reviewed" lines for the body. */
function coverageLines(run, merged) {
    const coverage = [];
    const note = (label, value) => value && coverage.push(`- **${label}:** ${value}`);
    note("Not reviewed", run.excluded?.map((e) => `\`${e.file}\` (${e.reason})`).join(", "));
    note("Skipped by a reviewer", merged.skipped?.map((s) => `\`${s.file}\` — ${s.agent}: ${s.why}`).join("; "));
    note("No output from", run.failedAxes?.join(", "));
    note("CI at this sha", run.ci);
    // Metrics the run knows it cannot gather. Stated, never approximated: review-pipeline.md#context.
    for (const [label, value] of Object.entries(run.notes || {})) note(label, value);
    note("Intent", run.intentMissing && "no pull request description was available to the reviewers");
    return coverage;
}

module.exports = async function publish({ github, context, core }) {
    const cfg = config();
    const { nitsInline: NITS_INLINE, maxComments: MAX_COMMENTS } = cfg.limits;
    const key = process.env.REVIEW_KEY;
    const dir = `${cfg.reviewDir}/${key}`;
    const read = (f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));

    const run = read("run.json");
    const merged = read("merged.json");
    const input = read("in/input.json");
    // A malformed summary costs the summary, never the review: this is the only job that posts.
    let integration = null;
    try {
        if (existsSync(`${dir}/integration.json`)) integration = read("integration.json");
    } catch (e) {
        core.warning(`unusable integration output, falling back to the mechanical summary - ${e.message}`);
    }

    const ranges = new Map(input.files.map((f) => [f.file, f.lines || []]));
    const postable = (f) =>
        (ranges.get(f.file) || []).some(([start, end]) => f.line >= start && (f.endLine || f.line) <= end);

    // A duplicate is not posted and not deleted: it goes to the appendix.
    const duplicates = new Map((integration?.duplicates || []).map((d) => [d.id, d]));

    const ordered = [...merged.findings].sort(
        (a, b) => RANK[a.severity] - RANK[b.severity] || a.file.localeCompare(b.file) || a.line - b.line,
    );
    const { comments, inBody } = splitFindings(ordered, {
        postable,
        duplicates,
        nitsInline: NITS_INLINE,
        maxComments: MAX_COMMENTS,
    });

    const sections = [];
    const section = (title, lines) => lines.length && sections.push(`\n### ${title}\n\n${lines.join("\n")}`);

    section(
        "Findings not attached to a line",
        inBody.map(([f, why]) => `- ${LABEL[f.severity]} ${location(f)} — ${f.description} _(${why})_`),
    );
    section(
        "Duplicates",
        [...duplicates.values()].map((d) => `- \`${d.id}\` duplicates \`${d.duplicateOf}\` — ${d.reason}`),
    );

    section("Coverage", coverageLines(run, merged));

    // The integration summary is the body, verbatim.
    const summary =
        integration?.summary ||
        `The integration pass did not complete, so this is mechanical: ${run.counts.blocking} blocking, ` +
            `${run.counts.important} important, ${run.counts.nit} nit. No summary was produced.`;
    const body = `${summary}\n${sections.join("\n")}`;

    const review = {
        ...context.repo,
        pull_number: run.pull_number,
        commit_id: run.head,
        event: "COMMENT", // never REQUEST_CHANGES: merge policy is not this pipeline's to hold
        body,
        comments,
    };

    try {
        await github.rest.pulls.createReview(review);
        core.info(`posted ${comments.length} comment(s), ${inBody.length} in the body`);
    } catch (e) {
        // Never find things and post nothing.
        core.warning(`GitHub rejected the comments (${e.status}): ${e.message}`);
        const listed = comments.map((c) => `- \`${c.path}:${c.start_line || c.line}\`\n\n${c.body}`).join("\n\n");
        await github.rest.pulls.createReview({
            ...review,
            comments: [],
            body: `${body}\n\n### Comments that could not be attached\n\n${listed}`,
        });
        core.setFailed(`posted without inline comments: ${e.message}`);
    }

    await core.summary.addRaw(body).write();
};
