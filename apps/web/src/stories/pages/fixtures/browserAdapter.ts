import { waitFor, within } from "storybook/test";

type BrowserState = "loading" | "loaded" | "failed" | "history";

const localPages = [
	{ path: "guide", title: "Project guide", body: "Use the board to inspect the current work." },
	{ path: "review", title: "Review guide", body: "Read the checks and the evidence before you approve a change." },
	{ path: "settings", title: "Settings guide", body: "Use project settings to manage labels and statuses." },
];

export async function browserAdapter(canvasElement: HTMLElement, state: BrowserState) {
	const body = canvasElement.ownerDocument.body;
	const view = await waitFor(() => {
		const element = body.querySelector("webview");
		if (element === null) throw new Error("The browser sheet has no webview element.");
		return element;
	});
	const pages = state === "history" ? localPages : [localPages[0]!];
	let index = state === "history" ? 1 : 0;
	const current = () => pages[index]!;
	const dispatch = (name: string, values: object = {}) => view.dispatchEvent(Object.assign(new Event(name), values));
	const frame = canvasElement.ownerDocument.createElement("iframe");
	frame.title = "Local browser document";
	frame.className = "h-full w-full border-0";
	frame.sandbox.add("allow-same-origin");
	view.classList.add("block");
	view.append(frame);
	const load = () => {
		dispatch("did-start-loading");
		frame.srcdoc = `<!doctype html><html><body><main><h1>${current().title}</h1><p>${current().body}</p><p>This document belongs to the local Storybook fixture.</p></main></body></html>`;
		dispatch("page-title-updated", { title: current().title });
		dispatch("did-navigate");
		dispatch("did-stop-loading");
	};
	Object.assign(view, {
		getURL: () => `https://storybook.invalid/${current().path}`,
		canGoToOffset: (offset: number) => index + offset >= 0 && index + offset < pages.length,
		goToOffset: (offset: number) => {
			index += offset;
			load();
		},
		reload: load,
	});
	const open = await within(body).findByRole("button", { name: "Open in browser" });
	open.addEventListener(
		"click",
		(event) => {
			event.preventDefault();
			event.stopImmediatePropagation();
		},
		true,
	);
	if (state === "loaded" || state === "history") load();
	if (state === "failed") {
		dispatch("did-fail-load", {
			errorCode: -105,
			errorDescription: "The local browser fixture reports a load error.",
			isMainFrame: true,
		});
	}
}
