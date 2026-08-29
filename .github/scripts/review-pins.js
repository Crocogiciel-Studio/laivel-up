#!/usr/bin/env node
// The model and effort an axis runs at, from its agent file's frontmatter.
//
//   require('./.github/scripts/review-pins.js')('api')   -> { model, effort }
//   node .github/scripts/review-pins.js api              -> model=opus\neffort=high
//
// Each reviewer runs as its own session rather than as a spawned subagent, so nothing reads that
// frontmatter for us and the workflow passes it on the command line. The pin still lives in the
// agent file, which is the only place a human should have to change it.

const { readFileSync } = require("node:fs");
const config = require("./review-config.js");

module.exports = function pins(agent) {
    const file = `${config().agentsRoot}/${agent}-reviewer.md`;
    const front = readFileSync(file, "utf8").split(/^---$/m)[1];
    if (!front) throw new Error(`${file}: no frontmatter`);
    const read = (key) => (front.match(new RegExp(String.raw`^${key}:\s*(\S+)`, "m")) || [])[1];
    const model = read("model");
    const effort = read("effort");
    if (!model || !effort) throw new Error(`${file}: model and effort must both be pinned`);
    return { model, effort };
};

// `node review-pins.js <agent> >> "$GITHUB_OUTPUT"`
if (require.main === module) {
    const { model, effort } = module.exports(process.argv[2]);
    process.stdout.write(`model=${model}\neffort=${effort}\n`);
}
