import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentRun, ReviewRevision } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { VerdictBar } from "./VerdictBar";

// Before a click, the bar reads only the query client from the app context.
const queryClient = new QueryClient();
const app = { queryClient } as AppContext;

const revision = { headSha: "8b21f0caa1b2c3d4", meta: { baseRefName: "master" } } as unknown as ReviewRevision;
const crispFjord = { id: "01J0", name: "crisp-fjord" } as unknown as AgentRun;

const render = (props: {
	ticket: string | null;
	run: AgentRun | null;
	drafts: string[];
	unmet: string[];
	phone?: boolean;
	showMerge?: boolean;
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

	expect(html).toContain("2 comments");
	expect(html).toContain("not yet: 1 check failed · 1 of 4 evidence · TRL-167 not merged");
	expect(html).toMatch(/<button[^>]*aria-label="Approve"/);
	expect(html).toMatch(/<button[^>]*aria-label="Request changes"/);
	expect(html).toMatch(/<button[^>]*aria-label="Comment"/);
	expect(html).toMatch(/<button[^>]*aria-label="Merge"/);
	expect(html).not.toMatch(/<button[^>]*aria-label="Merge"[^>]*disabled/);
});

test("a pull request with every condition met prints no condition line", () => {
	const html = render({ ticket: "TRL-203", run: crispFjord, drafts: ["01A"], unmet: [] });

	expect(html).toContain("1 comment");
	expect(html).not.toContain("not yet");
});

test("a ticket with no agent assignment keeps every verdict", () => {
	const html = render({ ticket: "TRL-203", run: null, drafts: [], unmet: [] });

	expect(html).toContain("0 comments");
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
