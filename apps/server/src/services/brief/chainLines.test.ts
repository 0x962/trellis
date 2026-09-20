import { expect, test } from "bun:test";
import type { Ticket } from "@trellis/api";
import type { ChainRow } from "../../db/queries/chainRows.ts";
import { chainLines } from "./chainLines.ts";

const ticket = (ready: boolean, releases: Ticket["releases"] = []): Pick<Ticket, "ready" | "releases"> => ({
	ready,
	releases,
});

const blocker = (fields: Partial<ChainRow> = {}): ChainRow => ({
	identifier: "OP-32",
	title: "Open the chat",
	status: "review",
	isQuestion: false,
	outcome: "",
	...fields,
});

test("prints the four chain lines in order and includes a finished outcome", () => {
	expect(
		chainLines(
			ticket(false, [
				{ identifier: "OP-35", title: "Close a stale run" },
				{ identifier: "OP-40", title: "Start an unattended run" },
			]),
			[
				blocker({
					identifier: "OP-29",
					title: "Create the runtime",
					status: "done",
					outcome: "The runtime writes one durable row.",
				}),
				blocker(),
				blocker({
					identifier: "OP-52",
					title: "Run late or leave missed",
					isQuestion: true,
				}),
			],
		),
	).toEqual([
		"## Chain",
		"",
		"- Waits on:",
		"  - OP-29 Create the runtime (done)",
		"    Outcome: The runtime writes one durable row.",
		"  - OP-32 Open the chat (agent review)",
		"  - OP-52 Run late or leave missed (human review)",
		"- Ready: no. OP-32 is not merged, and OP-52 is open.",
		"- Releases:",
		"  - OP-35 Close a stale run",
		"  - OP-40 Start an unattended run",
		"- Applies: OP-52, open. Run late or leave missed",
	]);
});

test("omits Applies when no question holds the ticket back", () => {
	expect(chainLines(ticket(false), [blocker()])).toEqual([
		"## Chain",
		"",
		"- Waits on:",
		"  - OP-32 Open the chat (agent review)",
		"- Ready: no. OP-32 is not merged.",
		"- Releases:",
		"  - nothing",
	]);
});

test("prints all three required lines when the ticket has no edges", () => {
	expect(chainLines(ticket(true), [])).toEqual([
		"## Chain",
		"",
		"- Waits on:",
		"  - nothing",
		"- Ready: yes. No ticket holds this one back.",
		"- Releases:",
		"  - nothing",
	]);
});

test("reads readiness from the ticket", () => {
	expect(chainLines(ticket(false), [])[4]).toBe("- Ready: no.");
});

test("a canceled question does not block readiness or apply", () => {
	expect(
		chainLines(ticket(true), [
			blocker({ identifier: "OP-52", title: "Old question", status: "canceled", isQuestion: true }),
		]),
	).toEqual([
		"## Chain",
		"",
		"- Waits on:",
		"  - OP-52 Old question (canceled)",
		"- Ready: yes. No ticket holds this one back.",
		"- Releases:",
		"  - nothing",
	]);
});

test("omits an outcome line when a finished ticket has no outcome", () => {
	expect(chainLines(ticket(true), [blocker({ status: "done" })])).toEqual([
		"## Chain",
		"",
		"- Waits on:",
		"  - OP-32 Open the chat (done)",
		"- Ready: yes. No ticket holds this one back.",
		"- Releases:",
		"  - nothing",
	]);
});
