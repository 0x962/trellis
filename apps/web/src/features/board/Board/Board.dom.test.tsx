import { afterEach, expect, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import type { BoardOutput, Project, Status } from "@trellis/api";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { createOrpc } from "../../../lib/orpc";
import { uiActions, useUiStore } from "../../../stores/uiStore";
import { Board } from "./Board";

const domTest = test.skipIf(typeof document === "undefined");
let dispose = async () => {};
afterEach(async () => dispose());
const statuses = ["started", "done", "canceled"].map((category, position) => ({
	id: category,
	name: category,
	slug: category,
	category,
	position,
	projectId: "project",
})) as Status[];

async function mount(saved?: string[]) {
	useUiStore.setState({ collapsedGroups: saved === undefined ? {} : { proof: saved } });
	const context = createOrpc();
	context.queryClient.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } });
	const seed = (key: readonly unknown[], value: unknown) => context.queryClient.setQueryData(key, value);
	seed(context.orpc.tickets.board.queryOptions({ input: { project: "PROOF" } }).queryKey, {
		columns: statuses.map((status) => ({ statusId: status.id, count: 205, items: [] })),
	} satisfies BoardOutput);
	seed(context.orpc.projects.get.queryOptions({ input: { project: "PROOF" } }).queryKey, { statuses } as Project);
	seed(context.orpc.projects.list.queryOptions({ input: { archived: true } }).queryKey, []);
	seed(context.orpc.agentRuns.list.queryOptions({ input: { assigned: true } }).queryKey, {
		items: [],
		nextCursor: null,
	});
	seed(context.orpc.labels.list.queryOptions({ input: { project: "PROOF" } }).queryKey, { labels: [], groups: [] });
	seed(context.orpc.statuses.list.queryOptions({ input: { project: "PROOF" } }).queryKey, { statuses });
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () =>
		root.render(
			<QueryClientProvider client={context.queryClient}>
				<AppProvider value={context as AppContext}>
					<Board projectRef="PROOF" storageKey="proof" onOpenTicket={() => {}} />
				</AppProvider>
			</QueryClientProvider>,
		),
	);
	dispose = async () => {
		await act(async () => root.unmount());
		container.remove();
		context.queryClient.clear();
	};
	return container;
}

domTest("starts with Done and Canceled rails and retains collapse under the existing store key", async () => {
	const container = await mount();
	expect(useUiStore.getState().collapsedGroups.proof).toEqual(["done", "canceled"]);
	const rail = container.querySelector<HTMLButtonElement>('button[aria-label="Expand done"]')!;
	expect(rail).not.toBeNull();
	expect(container.querySelector('button[aria-label="Expand canceled"]')).not.toBeNull();
	expect(container.querySelector('section[data-category="started"]')).not.toBeNull();
	await act(async () => rail.click());
	expect(useUiStore.getState().collapsedGroups.proof).toEqual(["canceled"]);
	await act(async () =>
		container.querySelector<HTMLButtonElement>('section[data-category="done"] button[aria-expanded]')!.click(),
	);
	expect(document.activeElement?.getAttribute("aria-label")).toBe("Expand done");
	expect(JSON.parse(localStorage.getItem("trellis-ui")!).state.collapsedGroups.proof).toEqual(["canceled", "done"]);
});

domTest("restores an explicitly expanded Done column and a collapsed active column", async () => {
	const container = await mount(["started", "canceled"]);
	expect(container.querySelector('section[data-category="done"]')).not.toBeNull();
	expect(container.querySelector('button[aria-label="Expand started"]')).not.toBeNull();
	await act(async () => uiActions.setGroupCollapsed("proof", "done", true));
	expect(container.querySelector('button[aria-label="Expand done"]')).not.toBeNull();
});
