import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const browser = new Window({ url: "http://localhost:4173" });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
	"window",
	"scrollTo",
	"document",
	"navigator",
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
const { ticket } = await import("../../../stories/pages/fixtures/project");
const { projectResponses } = await import("../../../stories/pages/fixtures/responses");
const { PageSheet } = await import("../../shell/PageSheet");
const { usePickerStore } = await import("../stores/pickerStore");
const { branchName, titleSlug } = await import("../PropertiesRail/utils/branchName");
const { Header } = await import("./Header");

afterAll(async () => {
	await browser.happyDOM.abort();
	for (const [name, descriptor] of globals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
});

async function mount(sheet = false, width = 1280) {
	browser.happyDOM.setWindowSize({ width, height: 800 });
	let deletes = 0;
	const abort = new AbortController();
	const parameters = {
		path: "/search",
		toaster: false,
		responses: {
			...projectResponses,
			"brief.get": { markdown: "Archived ticket brief" },
			"tickets.delete": () => {
				deletes += 1;
				return {};
			},
		},
	};
	const prepared = await prepareStory(abort.signal, parameters);
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const settle = () =>
		act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 30));
		});
	const render = async (readOnly: boolean) => {
		await act(async () => {
			const header = <Header ticket={ticket} readOnly={readOnly} />;
			root.render(
				<AppStory prepared={prepared} parameters={parameters} theme="light">
					{sheet ? (
						<PageSheet open onClose={() => {}} title="Ticket">
							{header}
						</PageSheet>
					) : (
						header
					)}
				</AppStory>,
			);
		});
		await settle();
	};
	await render(true);
	const button = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
	const item = (name: string) =>
		[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((row) => row.textContent === name)!;
	const click = async (element: HTMLElement) => {
		await act(async () => element.click());
		await settle();
	};
	const open = () => click(button("More actions"));
	return {
		render,
		button,
		item,
		click,
		open,
		settle,
		deletes: () => deletes,
		close: async () => {
			await act(async () => root.unmount());
			abort.abort();
			container.remove();
		},
	};
}

for (const sheet of [false, true]) {
	test(`archived ${sheet ? "sheet" : "page"} keeps copies and disables every menu write`, async () => {
		const fixture = await mount(sheet);
		const branch = branchName(ticket.identifier, titleSlug(ticket.title));
		await fixture.click(fixture.button("Copy ID"));
		expect(await navigator.clipboard.readText()).toBe(ticket.identifier);
		await fixture.click(fixture.button("Copy branch name"));
		expect(await navigator.clipboard.readText()).toBe(branch);
		for (const [label, value] of [
			["Copy brief", "Archived ticket brief"],
			["Copy branch name", branch],
			["Copy link", `http://localhost:4173/t/${ticket.identifier}`],
		] as const) {
			await fixture.open();
			await fixture.click(fixture.item(label!));
			expect(await navigator.clipboard.readText()).toBe(value);
		}
		await fixture.open();
		for (const label of ["Set labels", "Set parent", "Set dependencies", "Delete"]) {
			expect(fixture.item(label).getAttribute("aria-disabled")).toBe("true");
			await fixture.click(fixture.item(label));
		}
		expect(usePickerStore.getState().open).toBeNull();
		expect(document.querySelector('[role="alertdialog"]')).toBeNull();
		expect(fixture.deletes()).toBe(0);
		await fixture.close();
	});
}

test("the phone menu retains all existing copy actions", async () => {
	const fixture = await mount(false, 320);
	expect(fixture.button("Copy ID")).toBeNull();
	await fixture.open();
	for (const label of ["Copy brief", "Copy branch name", "Copy link"]) {
		expect(fixture.item(label).getAttribute("aria-disabled")).not.toBe("true");
	}
	await fixture.close();
});

test("archive changes update an open menu and discard a pending Delete confirmation", async () => {
	const fixture = await mount();
	await fixture.render(false);
	await fixture.open();
	expect(fixture.item("Set labels").getAttribute("aria-disabled")).not.toBe("true");
	await fixture.render(true);
	expect(fixture.item("Set labels").getAttribute("aria-disabled")).toBe("true");
	await fixture.render(false);
	await fixture.click(fixture.item("Delete"));
	expect(document.querySelector('[role="dialog"]')).not.toBeNull();
	await fixture.render(true);
	expect(document.querySelector('[role="dialog"]')).toBeNull();
	await fixture.render(false);
	expect(document.querySelector('[role="dialog"]')).toBeNull();
	expect(fixture.deletes()).toBe(0);
	await fixture.close();
});

test("archived copy shortcuts preserve text input and selected text", async () => {
	const fixture = await mount();
	const press = async (key: string, shiftKey = false, target: EventTarget = document) => {
		const event = new KeyboardEvent("keydown", { key, ctrlKey: true, shiftKey, bubbles: true, cancelable: true });
		await act(async () => {
			target.dispatchEvent(event);
		});
		await fixture.settle();
		return event;
	};
	for (const [key, shift, value] of [
		["c", false, ticket.identifier],
		["c", true, branchName(ticket.identifier, titleSlug(ticket.title))],
		[".", false, `http://localhost:4173/t/${ticket.identifier}`],
		["b", true, "Archived ticket brief"],
	] as const) {
		expect((await press(key, shift)).defaultPrevented).toBe(true);
		expect(await navigator.clipboard.readText()).toBe(value);
	}
	const input = document.createElement("input");
	document.body.append(input);
	await navigator.clipboard.writeText("Keep the selection");
	expect((await press("c", false, input)).defaultPrevented).toBe(false);
	expect(await navigator.clipboard.readText()).toBe("Keep the selection");
	input.remove();
	const text = document.createElement("p");
	text.textContent = "Selected ticket text";
	document.body.append(text);
	window.getSelection()!.selectAllChildren(text);
	expect((await press("c")).defaultPrevented).toBe(false);
	expect(await navigator.clipboard.readText()).toBe("Keep the selection");
	window.getSelection()!.removeAllRanges();
	text.remove();
	await fixture.close();
});
