// Page scripts can send false page-ready, page-scroll, and page-link messages.
// The app asks the person before it follows a link. Saved data changes only
// through the controls of the app.
const contentRuntime = (nonce: string) => {
	const send = (message: object) => parent.postMessage({ ...message, nonce }, "*");
	addEventListener("scroll", () => send({ type: "page-scroll", x: scrollX, y: scrollY }), { passive: true });
	addEventListener("load", () => send({ type: "page-ready" }), { once: true });
	addEventListener(
		"click",
		(event) => {
			const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
			if (!(anchor instanceof HTMLAnchorElement)) return;
			const target = new URL(anchor.href, location.href);
			if (target.origin === location.origin && target.pathname === location.pathname && target.hash) return;
			event.preventDefault();
			send({ type: "page-link", href: target.href });
		},
		true,
	);
	addEventListener("message", (event) => {
		if (event.source !== parent || event.data?.nonce !== nonce) return;
		const data = event.data;
		if (data.type !== "page-state") return;
		if (Number.isFinite(data.x) && Number.isFinite(data.y)) {
			scrollTo({ left: data.x, top: data.y, behavior: "instant" });
		}
		if (data.theme === "dark" || data.theme === "light") {
			document.documentElement.dataset.trellisTheme = data.theme;
			document.documentElement.style.colorScheme = data.theme;
		}
		for (const name of ["--color-bg", "--color-fg", "--color-accent"]) {
			if (typeof data.colors?.[name] === "string") {
				document.documentElement.style.setProperty(name, data.colors[name]);
			}
		}
	});
};

const frameRuntime = (nonce: string) => {
	const frame = document.querySelector("iframe")!;
	addEventListener("message", (event) => {
		if (event.data?.nonce !== nonce) return;
		if (event.source === frame.contentWindow) parent.postMessage(event.data, "*");
		if (event.source === parent) frame.contentWindow!.postMessage(event.data, "*");
	});
};

export const pageDocumentScript = (nonce: string) =>
	`<script>(${contentRuntime.toString()})(${JSON.stringify(nonce)})</script>`;
export const frameRelayScript = (nonce: string) =>
	`<script nonce="${nonce}">(${frameRuntime.toString()})(${JSON.stringify(nonce)})</script>`;
