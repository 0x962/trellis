# Evidence

Navid, 2026-09-21: "diffs are diffs. they are not evidence. evidence shows me that the change was completed in the product."

Each pull request carries two documents that the agent writes: the explanation and the evidence document. The Overview tab of the review page shows the explanation first and the evidence document under it.
Both documents belong to the current head. Rewrite both documents after each push.

Use any aid that helps the human understand the change and decide quickly.
Examples include charts, graphs, screenshots, videos, code snippets, diagrams, tables, and short definitions.
This list is not exhaustive.
Define a new concept before you use it.
Choose the smallest aid that makes the change or its proof clear.
The examples do not form a fixed evidence checklist.
Choose any clear form of explanation or proof.

## The explanation

Write it with `trellis summary write <pr> --headline "..." --why - --watch "..."`.
Use simple English to tell the human what changed, why it changed, and what the product now does.
Use product terms only when the human needs them.
Do not include commit IDs, branch names, head references, or internal implementation details.

## The evidence document

Write it with `trellis evidence write <pr> --body proof.md`, or pass `--body -` and send the Markdown on stdin. A new write replaces the document. Read it back with `trellis evidence show <pr>`.

Use the document only to show how you tested the change and what you observed.
Show the command or product action, the observed result, and the proof artifact.
Evidence can include commands, product actions, results, screenshots, recordings, responses, tables, and diagrams.
Do not include commit IDs, branch names, head references, or repository bookkeeping.
A diff is not evidence.

Use what makes the proof clear:

- Screenshots and recordings of each changed screen: `![what it shows](shots/after.png)`. The command uploads each local image and points the image at the stored file. Give each image alt text that says what it shows.
- Each real request with its response, in code blocks.
- The command you ran against a server of this branch, with its output, in a code block.
- Tables, and mermaid diagrams of a flow or of numbers before and after the change.

Run the product from your own worktree, on your own port, with your own data home. Show the case that works and the case that fails.

## The rule

`trellis pr add` and `trellis ready <pr>` check each linked pull request for the explanation of its current head and for the evidence document. While one is missing, they print it with the command that writes it, and they exit with code 1 for an agent. `trellis move <ticket> human-review` applies the same check to each open pull request of the ticket.

`trellis ready <pr>` and `trellis move <ticket> human-review` also ask an agent for a flow run. A flow is a saved set of agent steps that Trellis runs against a pull request. List the flows with `trellis flows list`, pick every flow that fits the change, and start each one with `trellis flows run <pr> --flow <slug>`. The command waits for the result. A run counts when it succeeds, and also when it stops at a step that only a person answers. When no flow fits the change, record the reason with `trellis ready <pr> --flow-does-not-apply "<reason>"`. Trellis keeps that reason with the pull request for the current head, and the person reads it beside the change. While a pull request has none of those three, both commands name the flows with the command that starts each, and they exit with code 1 for an agent. A flow belongs to one project, or to every project. Both commands ask a pull request for the flows of its ticket's project only, and a project with no flow of its own and no flow of every project asks for no run.

Run `trellis ready <pr>` before you hand over.
