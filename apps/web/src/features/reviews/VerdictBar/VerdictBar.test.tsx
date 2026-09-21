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

const render = (props: { ticket: string | null; run: AgentRun | null; drafts: string[]; unmet: string[] }) =>
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
					onDone={() => {}}
				/>
			</QueryClientProvider>
		</AppProvider>,
	);

test("the bar counts the drafts, names the agent, and keeps Merge live with three unmet conditions", () => {
	const html = render({
		ticket: "TRL-203",
		run: crispFjord,
		drafts: ["01A", "01B"],
		unmet: ["1 check failed", "1 of 4 evidence", "TRL-167 not merged"],
	});

	expect(html).toContain("2 drafts");
	expect(html).toContain("not yet: 1 check failed · 1 of 4 evidence · TRL-167 not merged");
	expect(html).toContain("Send back to crisp-fjord");
	expect(html).toContain("Comment only");
	expect(html).toContain("Merge");
	expect(html).not.toContain("disabled");
});

test("a pull request with every condition met prints no condition line", () => {
	const html = render({ ticket: "TRL-203", run: crispFjord, drafts: ["01A"], unmet: [] });

	expect(html).toContain("1 draft");
	expect(html).not.toContain("not yet");
});

test("a ticket with no agent assignment offers a new agent", () => {
	const html = render({ ticket: "TRL-203", run: null, drafts: [], unmet: [] });

	expect(html).toContain("0 drafts");
	expect(html).toContain("Send back to a new agent");
});

test("a pull request that no ticket links offers no send back", () => {
	const html = render({ ticket: null, run: null, drafts: [], unmet: [] });

	expect(html).not.toContain("Send back");
	expect(html).toContain("Comment only");
	expect(html).toContain("Merge");
});
