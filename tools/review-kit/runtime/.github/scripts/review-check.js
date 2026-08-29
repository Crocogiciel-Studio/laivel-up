#!/usr/bin/env node
// Is one reviewer's output publishable? Called by the reviewer job to drive the single retry
// docs/agents/review-pipeline.md#fan-out allows.
//
//   node .github/scripts/review-check.js <agent> <key>

const { readFileSync, writeFileSync } = require("node:fs");
const config = require("./review-config.js");

const [agent, key] = process.argv.slice(2);
if (!agent || !key) {
    console.error("usage: review-check.js <agent> <key>");
    process.exit(64);
}

const file = `${config().reviewDir}/${key}/${agent}.json`;
const raw = readFileSync(file, "utf8").trim();
const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

let data;
try {
    data = JSON.parse(json);
} catch (e) {
    console.error(`${agent}: not valid JSON - ${e.message}`);
    console.error("Return the JSON object on its own, with no prose and no code fence.");
    process.exit(1);
}

const problems = [];
if (!Array.isArray(data.findings)) problems.push("`findings` must be an array (use [] when you found nothing)");

data.findings?.forEach((f, i) => {
    const at = `findings[${i}]`;
    if (!["blocking", "important", "nit"].includes(f.severity))
        problems.push(`${at}.severity must be blocking, important or nit`);
    if (typeof f.file !== "string" || !f.file) problems.push(`${at}.file is required`);
    if (!Number.isInteger(f.line) || f.line < 1)
        problems.push(`${at}.line must be a line number in the HEAD version of the file`);
    if (typeof f.description !== "string" || !f.description.trim()) problems.push(`${at}.description is required`);
    if (f.endLine && f.endLine < f.line) problems.push(`${at}.endLine is before .line`);
    // review-publish.js renders `confidence`, so an omitted one publishes as confirmed silently.
    if (!["confirmed", "plausible"].includes(f.confidence))
        problems.push(`${at}.confidence must be confirmed or plausible`);
    // "It exists so you cannot report what you have not read" - review-output.schema.json.
    if (typeof f.evidence !== "string" || !f.evidence.trim())
        problems.push(`${at}.evidence is required: quote the offending code`);
});

if (problems.length) {
    console.error(`${agent}: this output cannot be published. Fix and return the JSON again:`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
}

data.agent = agent;
writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
console.log(`${agent}: ${data.findings.length} finding(s)`);
