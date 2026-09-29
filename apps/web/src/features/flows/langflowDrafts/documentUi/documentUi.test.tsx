import { afterAll, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import type { DocumentDraftCopy } from "../../LangflowEditor/components/DocumentDraftDialog";
import { draft } from "../fixtures/fixtures";

const browser = new Window({ url: "http://localhost:5188", settings: { disableIframePageLoading: true } });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const name of [
	"window",
	"document",
	"navigator",
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
		value: ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"].includes(name)
			? value.bind(browser)
			: value,
	});
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { DocumentDraftDialog } = await import("../../LangflowEditor/components/DocumentDraftDialog");

afterAll(async () => {
	await browser.happyDOM.abort();
	for (const [name, descriptor] of globals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
});

async function mount(copy: DocumentDraftCopy, readOnly = false, busy = false) {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const discarded: DocumentDraftCopy[] = [];
	const recovered: DocumentDraftCopy[] = [];
	await act(async () => {
		root.render(
			<DocumentDraftDialog
				copies={[copy]}
				error=""
				busy={busy}
				readOnly={readOnly}
				onClose={() => {}}
				onRecover={async (value) => {
					recovered.push(value);
				}}
				onDiscard={async (value) => {
					discarded.push(value);
				}}
			/>,
		);
	});
	const button = (label: string) =>
		[...document.querySelectorAll("button")].find((item) => item.textContent === label)!;
	return {
		button,
		discarded,
		recovered,
		click: (label: string) => act(async () => button(label).click()),
		close: async () => {
			await act(async () => root.unmount());
			container.remove();
		},
	};
}

test("the real dialog exports unsupported bytes exactly during rollback", async () => {
	const copy = { identity: draft().identity, bytes: ' { "version": 99, "unknown": "keep" }\n' };
	const blobs: Blob[] = [];
	const create = spyOn(URL, "createObjectURL").mockImplementation((value) => {
		blobs.push(value as Blob);
		return "blob:export";
	});
	const revoke = spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
	const click = spyOn(browser.HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
	const f = await mount(copy, true);
	try {
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
		expect(document.body.textContent).toContain("Unknown format. Export the original bytes.");
		expect(f.button("Open copy").disabled).toBe(true);
		expect(f.button("Export draft").disabled).toBe(false);
		await f.click("Export draft");
		expect(blobs).toHaveLength(1);
		expect(await blobs[0]!.text()).toBe(copy.bytes);
		expect(click).toHaveBeenCalledTimes(1);
		expect(f.recovered).toHaveLength(0);
	} finally {
		await f.close();
		await new Promise((resolve) => setTimeout(resolve, 1));
		create.mockRestore();
		revoke.mockRestore();
		click.mockRestore();
	}
});

test("the real confirmation names the tab and passes its exact reviewed bytes", async () => {
	const copy = { identity: draft().identity, bytes: JSON.stringify(draft()) };
	const f = await mount(copy);
	try {
		await f.click("Discard draft");
		expect(f.discarded).toHaveLength(0);
		expect(document.body.textContent).toContain(`selected draft for tab ${copy.identity.tab}`);
		const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')];
		const confirm = dialogs.find((dialog) => dialog.textContent?.includes("Discard this browser draft?"))!;
		const button = [...confirm.querySelectorAll("button")].find((item) => item.textContent === "Discard draft")!;
		await act(async () => button.click());
		expect(f.discarded).toEqual([copy]);
	} finally {
		await f.close();
	}
});

test("the real dialog keeps recovery and discard disabled during a pending save", async () => {
	const copy = { identity: draft().identity, bytes: JSON.stringify(draft()) };
	const f = await mount(copy, false, true);
	try {
		expect(f.button("Discard draft").disabled).toBe(true);
		expect(f.button("Open copy").disabled).toBe(true);
		expect(f.button("Export draft").disabled).toBe(false);
		await f.click("Discard draft");
		await f.click("Open copy");
		expect(f.discarded).toHaveLength(0);
		expect(f.recovered).toHaveLength(0);
	} finally {
		await f.close();
	}
});

test("the real dialog recovers only the selected identity and bytes", async () => {
	const copy = { identity: draft().identity, bytes: JSON.stringify(draft()) };
	const f = await mount(copy);
	try {
		await f.click("Open copy");
		expect(f.recovered).toEqual([copy]);
		expect(f.discarded).toHaveLength(0);
	} finally {
		await f.close();
	}
});
