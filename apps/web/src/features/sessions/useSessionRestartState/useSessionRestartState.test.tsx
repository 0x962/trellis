import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { sessionPane } from "../sessionPane";
import { useSessionRestart } from "../useSessionRestart";
import { useSessionRestartState } from "./useSessionRestartState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const run = (fields: Partial<AgentRun> = {}) =>
	({
		id: "run-1",
		runtime: "native",
		terminalId: "old-attempt",
		state: "running",
		processStatus: "running",
		error: null,
		observation: null,
		updatedAt: "2026-09-29T10:00:00.000Z",
		...fields,
	}) as AgentRun;

const oldExit = run({ state: "failed", processStatus: "exited", error: "Old process exited with code 1" });
const starting = run({
	terminalId: "new-attempt",
	state: "starting",
	processStatus: null,
	updatedAt: "2026-09-29T10:01:00.000Z",
});
const active = run({
	...starting,
	state: "running",
	processStatus: "running",
	updatedAt: "2026-09-29T10:02:00.000Z",
});
const failed = run({
	...starting,
	state: "failed",
	processStatus: "exited",
	error: "New launch failed",
	updatedAt: "2026-09-29T10:02:00.000Z",
});

async function fixture(initial = run()) {
	const response = Promise.withResolvers<AgentRun>();
	const errors: string[] = [];
	const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	const app = {
		queryClient,
		orpc: {
			agentRuns: { key: () => ["agent-runs"] },
			sessions: { key: () => ["sessions"] },
		},
	} as unknown as AppContext;
	let start!: ReturnType<typeof useSessionRestart>;
	let view!: ReturnType<typeof useSessionRestartState>;
	let other!: ReturnType<typeof useSessionRestartState>;
	const Control = ({ observed }: { observed: AgentRun }) => {
		start = useSessionRestart(observed, {
			mutationFn: () => response.promise,
			onError: (error) => errors.push(error.message),
		});
		return null;
	};
	const View = ({ observed }: { observed: AgentRun }) => {
		view = useSessionRestartState(observed);
		return null;
	};
	const OtherView = () => {
		other = useSessionRestartState(oldExit);
		return null;
	};
	const renderer = createRoot();
	const render = (observed: AgentRun, controls = true) =>
		act(async () => {
			renderer.render(
				<QueryClientProvider client={queryClient}>
					<AppProvider value={app}>
						{controls && <Control observed={observed} />}
						<View observed={observed} />
						{initial.id !== oldExit.id && <OtherView />}
					</AppProvider>
				</QueryClientProvider>,
			);
		});
	const settle = async (condition: () => boolean) => {
		for (let count = 0; count < 100 && !condition(); count += 1)
			await act(async () => await new Promise((resolve) => setTimeout(resolve, 10)));
		expect(condition()).toBeTrue();
	};
	await render(initial);
	return {
		response,
		errors,
		render,
		settle,
		view: () => view,
		other: () => other,
		pane: () => sessionPane(view.run, false, view.pending),
		start: async () => {
			await act(async () => start.mutate());
			await settle(() => view.pending);
		},
		complete: async (result: AgentRun) => {
			await act(async () => response.resolve(result));
			await settle(() => start.isSuccess);
		},
		close: async () => {
			await act(async () => renderer.unmount());
			queryClient.clear();
		},
	};
}

test("keeps startup through an old exit, a delayed launch, and a successful restart", async () => {
	const f = await fixture();
	try {
		await f.start();
		await f.render(oldExit);
		expect(f.pane().kind).toBe("starting");
		await f.complete(starting);
		expect(f.pane().kind).toBe("starting");
		expect(f.view().run.terminalId).toBe("new-attempt");
		await f.render(starting);
		await f.render(oldExit);
		expect(f.pane().kind).toBe("starting");
		await f.render(active);
		expect(f.pane().kind).toBe("terminal");
		await f.render(oldExit, false);
		expect(f.view().run).toEqual(active);
		expect(f.pane().kind).toBe("terminal");
	} finally {
		await f.close();
	}
});

test("shows a new launch failure while the restart request still waits", async () => {
	const f = await fixture();
	try {
		await f.start();
		await f.render(failed);
		expect(f.pane()).toMatchObject({ kind: "failed", detail: "New launch failed" });
		expect(f.view().busy).toBeTrue();
		await f.render(oldExit);
		expect(f.pane()).toMatchObject({ kind: "failed", detail: "New launch failed" });
		await f.complete(failed);
		expect(f.view().busy).toBeFalse();
	} finally {
		await f.close();
	}
});

test("preserves a real request error before the server replaces the attempt", async () => {
	const f = await fixture(oldExit);
	try {
		await f.start();
		await act(async () => f.response.reject(new Error("The host cannot confirm that the process stopped.")));
		await f.settle(() => !f.view().pending);
		expect(f.errors).toEqual(["The host cannot confirm that the process stopped."]);
		expect(f.pane()).toMatchObject({ kind: "failed", detail: oldExit.error });
	} finally {
		await f.close();
	}
});

test("uses the completed response when the last query still holds the old attempt", async () => {
	const f = await fixture();
	try {
		await f.start();
		await f.render(starting);
		await f.render(oldExit);
		await f.complete(active);
		expect(f.view().run).toEqual(active);
		expect(f.pane().kind).toBe("terminal");
	} finally {
		await f.close();
	}
});

test("does not hide an unrelated session failure", async () => {
	const f = await fixture(run({ id: "other-run" }));
	try {
		await f.start();
		expect(f.other().pending).toBeFalse();
		expect(sessionPane(f.other().run, false, f.other().pending).kind).toBe("failed");
		await f.complete(run({ id: "other-run" }));
		expect(f.pane().kind).toBe("terminal");
	} finally {
		await f.close();
	}
});
