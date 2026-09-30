import { afterAll, afterEach, expect, test } from "bun:test";
import type { TicketClassification, TicketClassificationInput } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import type { ComposerOptions } from "../../../composerStore";
import { type ComposerDraft, useComposerDraft } from "../../../hooks/useComposerDraft/useComposerDraft";
import { useClassifiedDraft } from "./useClassifiedDraft";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", {
	configurable: true,
	value: {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => storage.set(key, value),
		removeItem: (key: string) => storage.delete(key),
	},
});
afterAll(() => {
	if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
	else Reflect.deleteProperty(globalThis, "sessionStorage");
});
const dispose: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const close of dispose.splice(0)) await close();
	storage.clear();
});
const wait = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 650));
	});
const suggestion: TicketClassification = { epic: "TRL/forms", wave: "TRL/forms/first", priority: "high" };

async function fixture(options: ComposerOptions = {}, initial?: ComposerDraft) {
	if (initial) storage.set("trellis-composer-draft", JSON.stringify(initial));
	const requests: Array<{ input: TicketClassificationInput; resolve: (result: TicketClassification) => void }> = [];
	const app = {
		client: {
			tickets: {
				classify: (input: TicketClassificationInput) =>
					new Promise<TicketClassification>((resolve) => requests.push({ input, resolve })),
			},
		},
	} as unknown as AppContext;
	let state: ReturnType<typeof useComposerDraft>;
	let classification: ReturnType<typeof useClassifiedDraft>;
	let submitting = false;
	function Probe() {
		state = useComposerDraft();
		classification = useClassifiedDraft({
			...state,
			options,
			project: state.draft.project ?? "TRL",
			description: state.draft.description || "Template",
			template: "Template",
			defaultPriority: options.priority ?? "none",
			disabled: false,
			isSubmitting: () => submitting,
		});
		return null;
	}
	const root = createRoot();
	const render = () =>
		act(async () =>
			root.render(
				<AppProvider value={app}>
					<Probe />
				</AppProvider>,
			),
		);
	await render();
	dispose.push(async () => {
		await act(async () => root.unmount());
	});
	return {
		requests,
		draft: () => state!.draft,
		classification: () => classification!,
		edit: (change: Partial<ComposerDraft>) =>
			act(async () => state!.setDraft((current) => ({ ...current, ...change }))),
		choose: (change: Parameters<typeof classification.choose>[0]) => act(async () => classification!.choose(change)),
		submit: () => {
			submitting = true;
		},
		reopen: async () => {
			await act(async () => root.render(<div />));
			await render();
		},
	};
}

test("automatic fields follow later edits and survive a dialog reopen", async () => {
	const f = await fixture();
	await f.edit({ title: "Fix form" });
	await wait();
	await act(async () => f.requests[0]!.resolve(suggestion));
	expect(f.draft()).toMatchObject({ ...suggestion, automatic: ["epic", "wave", "priority"] });
	await f.reopen();
	await f.edit({ title: "Fix database" });
	await wait();
	const changed = { epic: "TRL/database", wave: "TRL/database/first", priority: "urgent" } as const;
	await act(async () => f.requests[1]!.resolve(changed));
	expect(f.draft()).toMatchObject(changed);
});

test("a manual choice keeps its value when it matches the automatic value", async () => {
	const f = await fixture();
	await f.edit({ title: "Fix form" });
	await wait();
	await act(async () => f.requests[0]!.resolve(suggestion));
	await f.choose({ priority: "high", epic: "TRL/forms", wave: null });
	await f.edit({ title: "Form outage" });
	await wait();
	expect(f.requests[1]!.input.epic).toBe("TRL/forms");
	await act(async () => f.requests[1]!.resolve({ ...suggestion, wave: "TRL/forms/second", priority: "urgent" }));
	expect(f.draft()).toMatchObject({
		epic: "TRL/forms",
		wave: "TRL/forms/second",
		priority: "high",
		automatic: ["wave"],
	});
	await f.reopen();
	await wait();
	await act(async () => f.requests[2]!.resolve({ ...suggestion, priority: "low" }));
	expect(f.draft().priority).toBe("high");
});

test("explicit page context constrains placement and preserves its priority", async () => {
	const f = await fixture({ epic: "TRL/forms", wave: "TRL/forms/first" });
	await f.edit({ title: "Fix form" });
	await wait();
	expect(f.requests[0]!.input).toMatchObject({ epic: "TRL/forms", wave: "TRL/forms/first" });
	await act(async () => f.requests[0]!.resolve(suggestion));
	expect(f.draft()).toMatchObject({ priority: "high", automatic: ["priority"] });
	expect(f.draft().epic).toBeUndefined();
	await f.choose({ priority: "none" });
	await f.edit({ title: "New context" });
	await wait();
	expect(f.requests).toHaveLength(1);
});

test("submission and immediate manual changes block a pending response", async () => {
	const f = await fixture();
	await f.edit({ title: "Fix form" });
	await wait();
	await act(async () => {
		f.classification().choose({ priority: "low" });
		f.requests[0]!.resolve(suggestion);
	});
	expect(f.draft().priority).toBe("low");
	await f.edit({ title: "Another form" });
	await wait();
	f.submit();
	await act(async () => f.requests[1]!.resolve({ ...suggestion, epic: "TRL/other" }));
	expect(f.draft().epic).toBe("TRL/forms");
});
