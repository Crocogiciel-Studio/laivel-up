---
title: <topic>
applies_to: "<glob the rules apply to>"
read_when: <the situation in which someone must read this>
---

# <Topic>

<One paragraph: what this document governs, and what it does not.>

<!--
  review-kit: how to write a rule here.

  - One rule per heading, with an explicit {#anchor}. The anchor is what a reviewer cites; renaming
    it breaks review-ownership.json, and the doctor will tell you.
  - Two or three lines of body. What the rule is, and the reference implementation to copy.
  - Write only rules the team already follows. A rule the codebase violates everywhere produces a
    reviewer that argues with the repo instead of with the diff.
  - Do not restate the rule in the agent file. The agent cites the anchor; this is where the words
    live.
-->

## <Rule, stated as the thing to do> {#anchor}

<What the rule is. What it prevents. The reference implementation: `path/to/Example`.>

## <Next rule> {#another-anchor}

<…>
