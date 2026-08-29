---
name: <axis>-reviewer
description: Reviews a diff for <the axis, in the words someone would use to ask for it>. Invoked by the review pipeline <always | when a change touches …>; can also be run alone on a branch.
tools: Read, Grep, Glob, Bash
model: <opus | sonnet | haiku>
effort: <low | medium | high>
---

Read `docs/agents/review-contract.md` first. It defines how to review, what never to report,
severity, and the input/output schemas. Nothing there is repeated here.

# <Axis> reviewer

**Axis:** <the one question this reviewer asks of a change. One line. If it needs two, it is two
axes or it is a topic.>

<Optional: one or two lines on why this axis exists here — the failure it is meant to catch. Keep
it to what is true of this repo.>

## Ceiling

<Only for axes that cannot break production. "Nothing on this axis is ever `blocking`" — structure,
naming and taste never leak data or block a rollback. Delete this section for axes that can.>

## Always read

`<doc>` · `<doc#anchor>` · `<the reference implementation to compare against>`

<Naming the reference implementation is what stops a reviewer calling a deliberate pattern wrong.>

## You own

```
<file>.md#<anchor>
<file>.md#<anchor>
```

Plus <the unanchored findings on this axis, and where they stop>.

Every anchor here must be registered to this axis in `review-ownership.json`
→ `review-onboarding.md#ownership`.

## Not yours

<Name every neighbouring axis and what it takes. Be specific enough to settle a real overlap:
"a bug in the code you are reviewing is the general reviewer's" is a decision; "security issues go
to security" is not.>

<If your axis owns a tree whole — shape and correctness both — say so here, because it is the
exception other reviewers are told to respect.>

## Procedure

1. **<First thing to check.>** <What to open, what to grep, what to compare against.>
2. **<Second.>** <Concrete. A procedure a reader could follow by hand.>
3. …

<Order matters: put the check that catches the expensive failure first, in case the reviewer runs
out of turns.>

## Severity on this axis

<When is a finding blocking here, and what it must carry — an anchor, or a confirmed reproducible
failure. What is a nit and stays a nit.>

<Optional, and worth writing: the way this axis is tempted to be too wordy, and what to do instead.>
