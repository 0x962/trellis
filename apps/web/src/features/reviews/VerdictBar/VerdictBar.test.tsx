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

const render = (props: { ticket: string | null; run: AgentRun | null; drafts: string[] }) =>
	renderToStaticMarkup(
		<AppProvider value={app}>
			<QueryClientProvider client={queryClient}>
				<VerdictBar
					pr="https://github.com/o/r/pull/1"
					revision={revision}
					ticket={props.ticket}
					run={props.run}
					drafts={props.drafts}
					onDone={() => {}}
				/>
			</QueryClientProvider>
		</AppProvider>,
	);

test("the bar offers each local verdict", () => {
	const html = render({
		ticket: "TRL-203",
		run: crispFjord,
		drafts: ["01A", "01B"],
	});

	expect(html).toContain("2 comments");
	expect(html).toMatch(/<button[^>]*aria-label="Approve"/);
	expect(html).toMatch(/<button[^>]*aria-label="Request changes"/);
	expect(html).toMatch(/<button[^>]*aria-label="Comment"/);
	expect(html).not.toMatch(/aria-label="Merge"/);
});

test("a pull request with one comment prints the singular count", () => {
	const html = render({ ticket: "TRL-203", run: crispFjord, drafts: ["01A"] });

	expect(html).toContain("1 comment");
});

test("a ticket with no agent assignment keeps every verdict", () => {
	const html = render({ ticket: "TRL-203", run: null, drafts: [] });

	expect(html).toContain("0 comments");
	expect(html).toMatch(/<button[^>]*aria-label="Approve"/);
	expect(html).toMatch(/<button[^>]*aria-label="Request changes"/);
	expect(html).toMatch(/<button[^>]*aria-label="Comment"/);
});

test("a pull request that no ticket links keeps every verdict", () => {
	const html = render({ ticket: null, run: null, drafts: [] });

	expect(html).toMatch(/<button[^>]*aria-label="Approve"/);
	expect(html).toMatch(/<button[^>]*aria-label="Request changes"/);
	expect(html).toMatch(/<button[^>]*aria-label="Comment"/);
	expect(html).not.toMatch(/aria-label="Merge"/);
});
