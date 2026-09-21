import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentRun, ReviewRevision, ReviewSubmission } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { VerdictBar } from "./VerdictBar";

// Before a click, the bar reads only the query client from the app context.
const queryClient = new QueryClient();
const app = { queryClient } as AppContext;

const revision = { headSha: "8b21f0caa1b2c3d4", meta: { baseRefName: "master" } } as unknown as ReviewRevision;
const crispFjord = { id: "01J0", name: "crisp-fjord" } as unknown as AgentRun;

const submission = (facts: Partial<ReviewSubmission>): ReviewSubmission => ({
	id: "01S",
	prId: "01P",
	url: "https://github.com/o/r/pull/1",
	author: "navid",
	verdict: "approved",
	body: "",
	revisionId: "01V",
	headSha: revision.headSha,
	byPerson: true,
	threads: [],
	createdAt: "2026-09-21T10:00:00.000Z",
	deliveries: [{ id: "01D", reviewId: "01S", runId: "01R", state: "sent", error: null, readAt: null }],
	...facts,
});

const render = (props: {
	ticket: string | null;
	run: AgentRun | null;
	drafts: string[];
	unmet: string[];
	phone?: boolean;
	showMerge?: boolean;
	submissions?: ReviewSubmission[];
}) =>
	renderToStaticMarkup(
		<AppProvider value={app}>
			<QueryClientProvider client={queryClient}>
				<VerdictBar
					pr="https://github.com/o/r/pull/1"
					revision={revision}
					ticket={props.ticket}
					run={props.run}
					drafts={props.drafts}
					submissions={props.submissions ?? []}
					unmetConditions={props.unmet}
					phone={props.phone ?? false}
					showMerge={props.showMerge ?? true}
					onDone={() => {}}
				/>
			</QueryClientProvider>
		</AppProvider>,
	);

test("the bar offers each local verdict and keeps Merge live with three unmet conditions", () => {
	const html = render({
		ticket: "TRL-203",
		run: crispFjord,
		drafts: ["01A", "01B"],
		unmet: ["1 check failed", "1 of 4 evidence", "TRL-167 not merged"],
	});

	expect(html).toContain("2 drafts");
	expect(html).toContain("not yet: 1 check failed · 1 of 4 evidence · TRL-167 not merged");
	expect(html).toMatch(/<button[^>]*aria-label="Approve"/);
	expect(html).toMatch(/<button[^>]*aria-label="Request changes"/);
	expect(html).toMatch(/<button[^>]*aria-label="Comment"/);
	expect(html).toMatch(/<button[^>]*aria-label="Merge"/);
	expect(html).not.toMatch(/<button[^>]*aria-label="Merge"[^>]*disabled/);
});

test("a pull request with every condition met prints no condition line", () => {
	const html = render({ ticket: "TRL-203", run: crispFjord, drafts: ["01A"], unmet: [] });

	expect(html).toContain("1 draft");
	expect(html).not.toContain("not yet");
});

test("a ticket with no agent assignment keeps every verdict", () => {
	const html = render({ ticket: "TRL-203", run: null, drafts: [], unmet: [] });

	expect(html).toContain("0 drafts");
	expect(html).toMatch(/<button[^>]*aria-label="Approve"/);
	expect(html).toMatch(/<button[^>]*aria-label="Request changes"/);
	expect(html).toMatch(/<button[^>]*aria-label="Comment"/);
});

test("a pull request that no ticket links keeps every verdict", () => {
	const html = render({ ticket: null, run: null, drafts: [], unmet: [] });

	expect(html).toMatch(/<button[^>]*aria-label="Approve"/);
	expect(html).toMatch(/<button[^>]*aria-label="Request changes"/);
	expect(html).toMatch(/<button[^>]*aria-label="Comment"/);
	expect(html).toMatch(/<button[^>]*aria-label="Merge"/);
});

test("a linked ticket keeps every verdict when Merge is not available", () => {
	const html = render({ ticket: "TRL-236", run: null, drafts: [], unmet: [], showMerge: false });

	expect(html).toMatch(/<button[^>]*aria-label="Approve"/);
	expect(html).toMatch(/<button[^>]*aria-label="Request changes"/);
	expect(html).toMatch(/<button[^>]*aria-label="Comment"/);
	expect(html).not.toMatch(/aria-label="Merge"/);
});

test("a phone draws the local verdicts, no Merge, and the reason for it", () => {
	const html = render({
		ticket: "TRL-217",
		run: crispFjord,
		drafts: ["01A"],
		unmet: ["1 check failed"],
		phone: true,
	});

	expect(html).toMatch(/<button[^>]*aria-label="Approve"/);
	expect(html).toMatch(/<button[^>]*aria-label="Request changes"/);
	expect(html).toMatch(/<button[^>]*aria-label="Comment"/);
	expect(html).not.toMatch(/aria-label="Merge"/);
	expect(html).toContain("A merge into an enterprise repository needs the desk.");
	expect(html).not.toContain("not yet");
});

test("a phone prints the reason although every condition is met", () => {
	const html = render({ ticket: "TRL-217", run: crispFjord, drafts: [], unmet: [], phone: true });

	expect(html).not.toMatch(/aria-label="Merge"/);
	expect(html).toContain("A merge into an enterprise repository needs the desk.");
});

test("an approval on the head commit replaces Approve and Request changes with Change verdict", () => {
	const html = render({ ticket: "TRL-259", run: crispFjord, drafts: [], unmet: [], submissions: [submission({})] });

	expect(html).toContain("You approved");
	expect(html).toContain("sent to the agent");
	expect(html).toContain('data-verdict="approved"');
	expect(html).toMatch(/<button[^>]*aria-label="Change verdict"/);
	expect(html).not.toMatch(/aria-label="Approve"/);
	expect(html).not.toMatch(/aria-label="Request changes"/);
	expect(html).toMatch(/<button[^>]*aria-label="Comment"/);
	expect(html).toMatch(/<button[^>]*aria-label="Merge"/);
});

test("a request for changes on the head commit shows the same control", () => {
	const html = render({
		ticket: "TRL-259",
		run: crispFjord,
		drafts: [],
		unmet: [],
		submissions: [submission({ verdict: "changes_requested", deliveries: [] })],
	});

	expect(html).toContain("You asked for changes");
	expect(html).toContain("no agent run took it");
	expect(html).toMatch(/<button[^>]*aria-label="Change verdict"/);
	expect(html).not.toMatch(/aria-label="Approve"/);
});

test("an approval on an older head commit is stale and brings the buttons back", () => {
	const html = render({
		ticket: "TRL-259",
		run: crispFjord,
		drafts: [],
		unmet: [],
		submissions: [submission({ headSha: "a1b2c3d4" })],
	});

	expect(html).toContain("You approved an older commit");
	expect(html).toMatch(/<button[^>]*aria-label="Approve"/);
	expect(html).toMatch(/<button[^>]*aria-label="Request changes"/);
	expect(html).not.toMatch(/aria-label="Change verdict"/);
});

test("a comment shows as the last note and keeps every verdict", () => {
	const html = render({
		ticket: "TRL-259",
		run: crispFjord,
		drafts: [],
		unmet: [],
		submissions: [submission({ verdict: "commented" })],
	});

	expect(html).toContain("You commented");
	expect(html).toMatch(/<button[^>]*aria-label="Approve"/);
	expect(html).not.toMatch(/aria-label="Change verdict"/);
});
