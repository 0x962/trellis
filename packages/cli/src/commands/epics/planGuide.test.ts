import { expect, test } from "bun:test";
import template from "../../instructions.md" with { type: "text" };
import { planGuideText } from "./planGuide.ts";

test("prints the planner guidance as one block", () => {
	expect(
		planGuideText(template),
	).toBe(`Plan an epic. A plan that produces several tickets is an epic. The epic description holds the goal, the fronts, the waves, and the questions for the person.
- A front is work that one agent finishes with no result from another front. Make one ticket per front per wave. Start its title with the front.
- A wave holds the tickets that you intend to start together. A wave gates nothing.
- Record order with \`--after\`. Each ticket that needs another ticket records \`--after\` on that ticket.
- After each set of parallel fronts, add a wave that integrates them. One ticket merges the branches and runs all checks.
- Keep the sequential steps of one front inside its ticket as ordered sub-tickets.
- Each ticket states its files, the files to leave alone, the verify commands, the review focus, and the evidence owed.
- Two tickets in one wave never own the same file.
- Keep a wave to 2 to 8 tickets and an epic to 6 waves. A larger plan is two epics.
- The person is the manager. The person starts the agents. Do not wait for a gate.
- Frontend evidence floor: summary, after image, before image, capture record, console list.
- Backend evidence floor: summary, working call, failing call, or a run record for CLI and background-job changes.
- Read the full evidence rules in \`docs/EVIDENCE.md\`.
Create the epic: trellis epics create --project KEY --name "..." --description - < plan.md
Create each wave in order: trellis waves create KEY/<epic-slug> --name "Foundation"
Create each ticket in its wave: trellis create -p KEY --wave KEY/<epic-slug>/<wave-slug> -t "Server: ..."
Read the epic, its waves with their counts, the tickets of each wave, and what is next: trellis epics show KEY/<epic-slug>
When you work on an epic ticket, read the plan and the results of the earlier waves first: trellis brief KEY-42
`);
});
