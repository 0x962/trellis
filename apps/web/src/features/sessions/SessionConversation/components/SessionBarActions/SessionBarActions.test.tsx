import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type AgentRun, HarnessSchema, type Session } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import { barSlots } from "../../../../../lib/barSlots";
import { SessionBarActions } from "./SessionBarActions";

// The Session details dialog reads the harness accounts to name the account
// of the run, and the Move to project dialog behind the session menu reads
// the projects. The render below needs the query options of those two reads
// and nothing more.
const queryClient = new QueryClient();
const app = {
	queryClient,
	orpc: {
		harnessAccounts: {
			list: { queryOptions: () => ({ queryKey: ["harnessAccounts.list"], queryFn: () => Promise.resolve([]) }) },
		},
		projects: {
			list: { queryOptions: () => ({ queryKey: ["projects.list"], queryFn: () => Promise.resolve([]) }) },
		},
	},
} as unknown as AppContext;

const run = {
	id: "01M334MEJNF3VS097DC6BS1BZ4",
	name: "crisp-fjord",
	runtime: "native",
	harness: HarnessSchema.parse({ preset: "codex", model: "openai/gpt-6-astra", effort: "max" }),
	kind: "session",
	projectId: "01M24SPHTX36AJ3VKTNZ263E7V",
	projectKey: "TRL",
	ticketId: "01M334MED9Z2GKBXMB6MVTED50",
	ticketIdentifier: "TRL-407",
	ticketTitle: "Session page controls use the shipped buttons",
	ticketStatusCategory: "started",
	assigned: true,
	state: "running",
	processStatus: "running",
	observation: null,
	workspaceId: "01M334MEJNF3VS097DC6BS1BZ4",
	terminalId: "01M334MEJNF3VS097DC6BS1BZ4",
	url: null,
	error: null,
	sessionId: "crisp-fjord",
	sessionLost: false,
	createdAt: "2026-09-21T23:25:48.313Z",
	updatedAt: "2026-09-21T23:26:05.825Z",
} as AgentRun;

const session = { id: "01M37K60PW5H6X7X0A7Q2BSB7C", name: "crisp-fjord", runId: run.id } as Session;

const render = (props: Partial<Parameters<typeof SessionBarActions>[0]> = {}) =>
	renderToStaticMarkup(
		<AppProvider value={app}>
			<QueryClientProvider client={queryClient}>
				<SessionBarActions
					run={run}
					session={session}
					summary={undefined}
					active
					busy={false}
					readOnly={false}
					onOpenTicket={() => {}}
					onStart={() => {}}
					onPause={() => {}}
					onRename={() => {}}
					{...props}
				/>
			</QueryClientProvider>
		</AppProvider>,
	);

test("the bar draws its three controls in one order", () => {
	expect(barSlots(render())).toEqual(["open-ticket", "play", "session-actions"]);
});

// A person reads one place for the action that stops and starts the
// process. The pane under the bar draws no button of its own.
test("the play control names the pause and the resume", () => {
	expect(render()).toContain("Pause session");
	expect(render({ active: false })).toContain("Resume session");
});

test("the read of the workspace moves no control", () => {
	const ready = { state: "ready", branch: "main", base: "main", head: "abc1234", ahead: 0, behind: 0, files: 0 };

	expect(barSlots(render({ summary: ready as never }))).toEqual(barSlots(render()));
});

test("a paused session keeps the play control in the same place", () => {
	expect(barSlots(render({ active: false }))).toEqual(barSlots(render()));
});

// `metal` is the brushed silver face of `packages/ui/src/base.css`, which
// the `primary` variant of `packages/ui/src/primitives/Button/variants.ts`
// applies. `bg-control` with `border-border-strong` is its `default`
// variant. No control of this bar carries a class of its own.
test("the play control is the one metal disk and the rest are control disks", () => {
	const html = render();

	expect(html.match(/class="[^"]*\bmetal\b[^"]*"/g)?.length).toBe(1);
	expect(html.match(/class="[^"]*\bbg-control\b[^"]*"/g)?.length).toBe(2);
});

test("every control of the bar is round", () => {
	const html = render();

	expect(html.match(/class="[^"]*\brounded-round\b[^"]*"/g)?.length).toBe(3);
});
