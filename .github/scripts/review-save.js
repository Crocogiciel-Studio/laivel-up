#!/usr/bin/env node
// Persist one agent's reply, from the action's structured output.
//
//   AGENT=api KEY=pr-3151 node .github/scripts/review-save.js
//
// Writes <reviewDir>/<KEY>/<AGENT>.json from FINDINGS, the action's `structured_output`.
//
// FINDINGS is empty whenever the action failed the step - including when it failed a run that had
// already produced a complete, schema-valid answer. It does that when the reported turn count
// overruns --max-turns: the session finishes, emits its findings, and the action then rejects the
// run for being over budget without ever setting the output. The reply is still in the execution
// log, which is written before that error, so read it from there rather than lose a finished
// review.

const { readFileSync, writeFileSync, mkdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const config = require("./review-config.js");

const { AGENT, KEY, FINDINGS, EXECUTION_FILE, RUNNER_TEMP } = process.env;
if (!AGENT || !KEY) {
    console.error("AGENT and KEY are required");
    process.exit(64);
}

/** Every top-level object in the execution log, whichever shape it was written in. */
function streamObjects(raw) {
    try {
        const whole = JSON.parse(raw);
        return Array.isArray(whole) ? whole : [whole];
    } catch {
        /* not one document; fall through to line-delimited */
    }
    const out = [];
    for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("{")) continue;
        try {
            out.push(JSON.parse(t));
        } catch {
            /* a fragment of a pretty-printed object; skip */
        }
    }
    return out;
}

/** The reply carried by the run's last `result` event. */
function fromExecutionLog() {
    const candidates = [EXECUTION_FILE, RUNNER_TEMP && join(RUNNER_TEMP, "claude-execution-output.json")];
    for (const file of candidates.filter((f) => f && existsSync(f))) {
        const results = streamObjects(readFileSync(file, "utf8")).filter((o) => o?.type === "result");
        for (const r of results.toReversed()) {
            if (r.structured_output) return [r.structured_output, file];
            if (typeof r.result === "string" && r.result.trim().startsWith("{")) {
                try {
                    return [JSON.parse(r.result), file];
                } catch {
                    /* prose, or truncated */
                }
            }
        }
    }
    return [null, null];
}

let data;
if (FINDINGS?.trim()) {
    data = JSON.parse(FINDINGS);
    console.log(`${AGENT}: taken from the action's structured output`);
} else {
    const [recovered, file] = fromExecutionLog();
    if (!recovered) {
        console.error(`::error::${AGENT} produced no structured output, and none could be recovered`);
        process.exit(1);
    }
    data = recovered;
    console.log(`::warning::${AGENT}: the action set no structured output; recovered the reply from ${file}`);
}

const dir = `${config().reviewDir}/${KEY}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/${AGENT}.json`, `${JSON.stringify(data, null, 2)}\n`);
console.log(`${AGENT}: wrote ${dir}/${AGENT}.json`);
