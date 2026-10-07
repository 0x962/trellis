import { afterAll, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { Window } from "happy-dom";

const browser = new Window({ url: "http://localhost:4173" });
browser.happyDOM.setWindowSize({ width: 320, height: 720 });
Object.defineProperty(browser.document, "fonts", { value: { ready: Promise.resolve() } });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
	"window",
	"document",
	"navigator",
	"DOMParser",
	"scrollTo",
	"localStorage",
	"sessionStorage",
	"HTMLElement",
	"Element",
	"Node",
	"DocumentFragment",
	"MutationObserver",
	"ResizeObserver",
	"NodeFilter",
	"getComputedStyle",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"CustomEvent",
	"KeyboardEvent",
	"MouseEvent",
	"PointerEvent",
]) {
	globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
	const value = name === "window" ? browser : Reflect.get(browser, name);
	Object.defineProperty(globalThis, name, {
		configurable: true,
		writable: true,
		value: ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "scrollTo"].includes(name)
			? value.bind(browser)
			: value,
	});
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AppStory, prepareStory } = await import("../../../stories/support");
const { archivedProject, ticket } = await import("../../../stories/pages/fixtures/project");
const { projectResponses } = await import("../../../stories/pages/fixtures/responses");
const { TicketView } = await import("./TicketView");

afterAll(async () => {
	await browser.happyDOM.abort();
	for (const [name, descriptor] of globals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
});

async function mount(responses: NonNullable<Parameters<typeof prepareStory>[1]>["responses"]) {
	const abort = new AbortController();
	const parameters = { path: "/search", responses: { ...projectResponses, ...responses } };
	const prepared = await prepareStory(abort.signal, parameters);
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(
			<AppStory prepared={prepared} parameters={parameters} theme="light">
				<TicketView identifier={ticket.identifier} />
			</AppStory>,
		);
		await new Promise((resolve) => setTimeout(resolve, 20));
	});
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 20));
	});
	return {
		container,
		prepared,
		button: (text: string) =>
			[...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === text)!,
		settle: () =>
			act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 20));
			}),
		close: async () => {
			await act(async () => root.unmount());
			abort.abort();
			container.remove();
		},
	};
}

test("a phone reads the task before the properties in document order", async () => {
	const fixture = await mount({});
	const ask = fixture.container.querySelector('[aria-label="The ask"]')!;
	const properties = fixture.container.querySelector('[aria-label="Properties"]')!;
	expect(ask.compareDocumentPosition(properties) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
	expect(fixture.container.querySelector("aside")).toBeNull();
	await fixture.close();
});

test("Retry repeats a failed ticket request and restores the task", async () => {
	let attempts = 0;
	const fixture = await mount({
		"tickets.get": () => {
			attempts += 1;
			if (attempts === 1) throw new Error("Synthetic request failure");
			return ticket;
		},
	});
	expect(fixture.container.querySelector('[role="alert"]')?.textContent).toContain("DEMO-40 did not load.");
	expect(fixture.container.querySelector("details")?.textContent).toContain("Synthetic request failure");
	await act(async () => fixture.button("Retry").click());
	await fixture.settle();
	expect(attempts).toBe(2);
	expect(fixture.container.querySelector('[aria-label="The ask"]')).not.toBeNull();
	expect(fixture.container.querySelector('[role="alert"]')).toBeNull();
	await fixture.close();
});

test("a missing ticket stays separate from a request failure", async () => {
	const fixture = await mount({
		"tickets.get": () => {
			throw new ORPCError("NOT_FOUND");
		},
	});
	expect(fixture.container.textContent).toContain("does not exist");
	expect(fixture.button("Retry")).toBeUndefined();
	await fixture.close();
});

test("an archived ticket keeps read controls and disables mutation controls", async () => {
	const fixture = await mount({
		"projects.list": (input: { archived?: boolean }) => (input.archived ? [archivedProject] : []),
		"tickets.get": {
			...ticket,
			description: "[Read the guide](https://example.com/reference)",
			prRows: [
				{
					id: "pr",
					number: 88,
					url: "https://github.com/example/trellis/pull/88",
					title: "Read the pull request",
					state: "open",
					isDraft: false,
					isQueued: false,
					localState: "ready",
					verdict: null,
					reviewGaps: [],
				},
			],
		},
	});
	expect(fixture.container.querySelector<HTMLTextAreaElement>('[aria-label="Title"]')!.readOnly).toBe(true);
	expect(fixture.button("Todo").disabled).toBe(true);
	expect(fixture.button("Urgent").disabled).toBe(true);
	expect(fixture.button("Add").disabled).toBe(true);
	expect(fixture.container.querySelector<HTMLButtonElement>('[aria-label="Open DEMO-41"]')!.disabled).toBe(false);
	expect(fixture.container.querySelector('a[href="https://example.com/reference"]')).not.toBeNull();
	const pr = [...fixture.container.querySelectorAll("button")].find((button) =>
		button.textContent?.includes("Read the pull request"),
	)!;
	expect(pr.disabled).toBe(false);
	expect(pr.closest("fieldset[disabled]") === null).toBe(true);
	await fixture.close();
});

test("failed uploads keep Retry only while the ticket is active", async () => {
	let attempts = 0;
	const fixture = await mount({
		"attachments.upload": () => {
			attempts += 1;
			throw new Error("Synthetic upload failure");
		},
	});
	const input = fixture.container.querySelector<HTMLInputElement>('input[type="file"]')!;
	Object.defineProperty(input, "files", {
		value: [new File(["Synthetic upload"], "retry-review.txt", { type: "text/plain" })],
	});
	await act(async () => {
		const change = document.createEvent("Event");
		change.initEvent("change", true, true);
		input.dispatchEvent(change);
	});
	await fixture.settle();
	const retry = () => fixture.container.querySelector<HTMLButtonElement>('[aria-label="Retry retry-review.txt"]');
	expect(attempts).toBe(1);
	expect(retry()!.disabled).toBe(false);
	await act(async () => retry()!.click());
	await fixture.settle();
	expect(attempts).toBe(2);
	await act(async () => {
		const { queryClient, orpc } = fixture.prepared.app;
		queryClient.setQueryData(orpc.projects.list.queryKey({ input: { archived: true } }), [archivedProject]);
	});
	await fixture.settle();
	expect(fixture.container.querySelector<HTMLTextAreaElement>('[aria-label="Title"]')!.readOnly).toBe(true);
	expect(retry()).toBeNull();
	const dismiss = fixture.container.querySelector<HTMLButtonElement>('[aria-label="Dismiss retry-review.txt"]')!;
	expect(dismiss.disabled).toBe(false);
	await act(async () => dismiss.click());
	expect(fixture.container.querySelector('[aria-label="Dismiss retry-review.txt"]')).toBeNull();
	expect(attempts).toBe(2);
	await fixture.close();
});
