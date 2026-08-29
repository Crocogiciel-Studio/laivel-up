// Stage 4, first half: concatenate the reviewers' findings and mint an id for each, so the
// integration reviewer's `duplicates` list has something to point at.
//
//   require('./.github/scripts/review-merge.js')({ github, context, core })
//
// review-pipeline.md#integration: "Merging is concatenation plus ids. Nothing else touches a
// finding's text, ever."
//
// The id prefixes come from the config and must never be renamed once a run has started:
// integration's `duplicates` references them.

const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const config = require("./review-config.js");

module.exports = async function merge({ core }) {
    const cfg = config();
    const key = process.env.REVIEW_KEY;
    const dir = `${cfg.reviewDir}/${key}`;
    const run = JSON.parse(readFileSync(`${dir}/run.json`, "utf8"));

    const findings = [];
    const skipped = [];
    run.failedAxes = [];
    run.produced = {};

    for (const axis of cfg.axes) {
        if (!run.agents.includes(axis.name)) continue;

        const file = `${dir}/${axis.name}.json`;
        if (!existsSync(file)) {
            // Reported, never dropped: review-pipeline.md#fan-out.
            run.failedAxes.push(axis.name);
            continue;
        }

        // An axis whose check failed still uploads its file - the upload step is `if: always()`,
        // so that a broken reply can be read from the artifact. A malformed one is that axis
        // failing, exactly like a missing file. It must not take the whole review down with it.
        let data;
        try {
            data = JSON.parse(readFileSync(file, "utf8"));
            if (!Array.isArray(data.findings)) throw new Error("no findings array");
        } catch (e) {
            core.warning(`${axis.name}: unusable output, treating the axis as failed - ${e.message}`);
            run.failedAxes.push(axis.name);
            continue;
        }

        data.findings.forEach((f, i) => findings.push({ id: `${axis.prefix}-${i + 1}`, agent: axis.name, ...f }));
        for (const s of data.skipped || []) skipped.push({ agent: axis.name, ...s });
        run.produced[axis.name] = data.findings.length;
    }

    writeFileSync(`${dir}/merged.json`, `${JSON.stringify({ findings, skipped }, null, 2)}\n`);
    run.counts = { blocking: 0, important: 0, nit: 0 };
    for (const f of findings) run.counts[f.severity]++;
    writeFileSync(`${dir}/run.json`, `${JSON.stringify(run, null, 2)}\n`);

    core.info(`${findings.length} findings ${JSON.stringify(run.counts)}`);
    if (run.failedAxes.length) core.warning(`no output from: ${run.failedAxes.join(", ")}`);
};
