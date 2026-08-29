#!/usr/bin/env node
// Prints a schema as compact JSON, for `claude --json-schema`.
//
//   node .github/scripts/review-schema.js output       -> a reviewer's findings
//   node .github/scripts/review-schema.js integration  -> the summary and duplicate list
//
// Derived from <docsRoot>/schemas/review-output.schema.json so there is one source of truth.
// Two things are dropped, because structured output cannot express them and the API rejects a
// schema that contains them:
//
//   - `$defs`/`$ref` - the finding definition is inlined instead.
//   - the `allOf`/`if`/`then` description caps - review-check.js keeps enforcing those.

const { readFileSync } = require("node:fs");
const config = require("./review-config.js");

const which = process.argv[2] || "output";
const load = (n) => JSON.parse(readFileSync(`${config().docsRoot}/schemas/review-${n}.schema.json`, "utf8"));

// The integration schema has no $defs and no conditional caps, so it needs no reduction.
if (which === "integration") {
    const s = load("integration");
    const strip = (o) => {
        delete o.description;
        for (const v of Object.values(o.properties || {})) strip(v);
        if (o.items) strip(o.items);
        return o;
    };
    const { $schema, $id, title, ...rest } = strip(s);
    process.stdout.write(JSON.stringify(rest));
    process.exit(0);
}

const src = load("output");

const finding = structuredClone(src.$defs.finding);
delete finding.allOf;
for (const p of Object.values(finding.properties)) delete p.description;

const out = {
    type: "object",
    additionalProperties: false,
    required: src.required.filter((k) => k !== "agent"), // the run knows the axis; the model does not set it
    properties: {
        findings: { type: "array", items: finding },
        skipped: { ...src.properties.skipped },
    },
};
delete out.properties.skipped.description;
for (const p of Object.values(out.properties.skipped.items.properties)) delete p.description;

process.stdout.write(JSON.stringify(out));
