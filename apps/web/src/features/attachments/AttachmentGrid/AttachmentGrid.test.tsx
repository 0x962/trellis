import { afterAll, expect, test } from "bun:test";
import type { Attachment } from "@trellis/api";
import { Window } from "happy-dom";

const browser = new Window({ url: "http://localhost:4173" });
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
const { QueryClientProvider } = await import("@tanstack/react-query");
const { AppProvider } = await import("../../../lib/appContext");
const { createStoryApp } = await import("../../../stories/support/createStoryApp");
const { AttachmentGrid } = await import("./AttachmentGrid");

afterAll(async () => {
	await browser.happyDOM.abort();
	for (const [name, descriptor] of globals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
});

const images: Attachment[] = ["one.png", "two.png"].map((filename, index) => ({
	id: `01M3ST0RYB00K0000000000000${index}`,
	ticketId: "01M3ST0RYB00K0000000000100",
	filename,
	mime: "image/png",
	size: 1,
	sha256: "a".repeat(64),
	url: `/image-${index}.png`,
	actor: { kind: "human", name: "Fixture" },
	createdAt: "2026-10-07T00:00:00.000Z",
}));

async function mount(readOnly = false) {
	const app = createStoryApp({ responses: { "attachments.list": images } });
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(
			<AppProvider value={app}>
				<QueryClientProvider client={app.queryClient}>
					<AttachmentGrid ticket="DEMO-40" initialAttachments={images} readOnly={readOnly} />
				</QueryClientProvider>
			</AppProvider>,
		);
	});
	const settle = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, 30)));
	const thumbnail = (index: number) => container.querySelectorAll<HTMLButtonElement>("[data-thumbnail]")[index]!;
	return {
		thumbnail,
		container,
		settle,
		open: async (index: number) => {
			await act(async () => {
				thumbnail(index).focus();
				thumbnail(index).click();
			});
			await settle();
		},
		close: async () => {
			await act(async () => root.unmount());
			app.queryClient.clear();
			container.remove();
		},
	};
}

test("Close dismisses the image preview and returns focus to its thumbnail", async () => {
	const fixture = await mount();
	await fixture.open(0);
	const close = document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="Close"]')!;
	expect(close).not.toBeNull();
	expect(document.activeElement).toBe(close);
	await act(async () => close.click());
	await fixture.settle();
	expect(document.querySelector('[role="dialog"]')).toBeNull();
	expect(document.activeElement).toBe(fixture.thumbnail(0));
	await fixture.close();
});

test("an archived preview keeps Close and returns focus to the selected image", async () => {
	const fixture = await mount(true);
	expect(fixture.container.querySelector('input[type="file"]')).toBeNull();
	await fixture.open(0);
	await act(async () => {
		document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
	});
	expect(document.querySelector('[role="dialog"] img')?.getAttribute("alt")).toBe("two.png");
	const close = document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="Close"]')!;
	await act(async () => close.click());
	await fixture.settle();
	expect(document.querySelector('[role="dialog"]')).toBeNull();
	expect(document.activeElement).toBe(fixture.thumbnail(1));
	await fixture.close();
});
