import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../../lib/appContext";
import { useCreatePlacement } from "./useCreatePlacement";

type Choice = { id: string; ref: string; name: string; slug: string };
const plan: Choice = { id: "epic", ref: "PR/plan", name: "Plan", slug: "plan" };
const wave: Choice = { id: "wave", ref: "PR/plan/first", name: "First", slug: "first" };
const defaultEpic: Choice = { ...plan, ref: "PR/default", name: "Default", slug: "default" };
const defaultWave: Choice = { ...wave, ref: "PR/default/default", name: "Default", slug: "default" };
const render = (epics?: Choice[], waves?: Choice[], epicRef?: string, waveRef?: string) => {
	const queryClient = new QueryClient();
	const listKey = ["epics"];
	const detailKey = ["epic"];
	if (epics !== undefined) queryClient.setQueryData(listKey, epics);
	if (waves !== undefined) queryClient.setQueryData(detailKey, { waves });
	const app = {
		orpc: {
			epics: {
				list: { queryOptions: () => ({ queryKey: listKey, queryFn: async () => epics }) },
				get: { queryOptions: () => ({ queryKey: detailKey, queryFn: async () => ({ waves }) }) },
			},
		},
	} as unknown as AppContext;
	let result: ReturnType<typeof useCreatePlacement>;
	function Probe() {
		result = useCreatePlacement("PR", epicRef, waveRef);
		return null;
	}
	renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<AppProvider value={app}>
				<Probe />
			</AppProvider>
		</QueryClientProvider>,
	);
	queryClient.clear();
	return result!;
};

test("empty projects display both defaults before creation", () => {
	expect(render([])).toMatchObject({
		epicName: "Default (new)",
		waveName: "Default (new)",
		ready: true,
		epic: undefined,
		wave: undefined,
	});
});

test("an empty selected epic displays its default wave", () => {
	expect(render([plan], [], plan.ref)).toMatchObject({
		epic: plan.ref,
		epicName: "Plan",
		waveName: "Default (new)",
		ready: true,
	});
});

test("existing choices require an epic and wave even when each list has one entry", () => {
	expect(render([plan])).toMatchObject({ ready: false, message: "Choose an epic." });
	expect(render([plan], [wave], plan.ref)).toMatchObject({ ready: false, message: "Choose a wave." });
	expect(render([plan], [wave], plan.ref, wave.ref)).toMatchObject({ ready: true, epic: plan.ref, wave: wave.ref });
});

test("sole defaults remain selected and additional choices require selection", () => {
	expect(render([defaultEpic], [defaultWave])).toMatchObject({
		ready: true,
		epic: defaultEpic.ref,
		wave: defaultWave.ref,
	});
	expect(render([defaultEpic, plan])).toMatchObject({ ready: false, epic: undefined });
	expect(render([plan], [defaultWave, wave], plan.ref)).toMatchObject({ ready: false, wave: undefined });
});

test("a prior project or epic selection cannot enable creation", () => {
	expect(render([plan], [wave], "OTHER/plan", wave.ref)).toMatchObject({ ready: false, epic: undefined });
	expect(render([plan], [wave], plan.ref, "PR/other/wave")).toMatchObject({ ready: false, wave: undefined });
});

test("creation waits for both lists", () => {
	expect(render()).toMatchObject({ ready: false, message: "Load epics and waves…" });
	expect(render([plan], undefined, plan.ref)).toMatchObject({ ready: false, message: "Load epics and waves…" });
});
