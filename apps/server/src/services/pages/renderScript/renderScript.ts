import type { PageCommentAnchor } from "@trellis/api";

// Page scripts can send false viewer and comment messages. The app asks the
// person before it follows a link. A false comment anchor can only open the
// parent composer. Saved data changes only through the controls of the app.
const contentRuntime = (nonce: string) => {
	const send = (message: object) => parent.postMessage({ ...message, nonce }, "*");
	const pathOf = (element: Element) => {
		const parts = [];
		let current: Element | null = element;
		while (current !== null) {
			const name = current.localName;
			if (current === document.documentElement) {
				parts.unshift(name);
				break;
			}
			let position = 1;
			for (let sibling = current.previousElementSibling; sibling !== null; sibling = sibling.previousElementSibling) {
				if (sibling.localName === name) position += 1;
			}
			parts.unshift(`${name}:nth-of-type(${position})`);
			current = current.parentElement;
		}
		return parts.join(">");
	};
	const selectedAnchor = () => {
		const selection = getSelection();
		if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return undefined;
		const range = selection.getRangeAt(0);
		const root =
			range.commonAncestorContainer instanceof Element
				? range.commonAncestorContainer
				: range.commonAncestorContainer.parentElement;
		const quote = selection.toString();
		if (root === null || quote.trim() === "") return undefined;
		if (quote.length > 2000) return null;
		const before = range.cloneRange();
		before.selectNodeContents(root);
		before.setEnd(range.startContainer, range.startOffset);
		const text = root.textContent ?? "";
		const start = before.toString().length;
		return {
			kind: "text",
			path: pathOf(root),
			quote,
			prefix: text.slice(Math.max(0, start - 32), start),
			suffix: text.slice(start + quote.length, start + quote.length + 32),
		};
	};
	const reportAnchor = (element: Element | null) => {
		const selection = selectedAnchor();
		if (selection === null) {
			send({ type: "page-comment-anchor-error", message: "Select 2,000 characters or fewer." });
			return;
		}
		const anchor = selection ?? (element === null ? null : { kind: "element", path: pathOf(element) });
		if (anchor !== null) send({ type: "page-comment-anchor", anchor });
	};
	const textRange = (element: Element, anchor: { quote: string; prefix: string; suffix: string }) => {
		const text = element.textContent ?? "";
		let start = text.indexOf(anchor.quote);
		while (start >= 0) {
			if (
				text.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix &&
				text.slice(start + anchor.quote.length, start + anchor.quote.length + anchor.suffix.length) === anchor.suffix
			) {
				const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
				let offset = 0;
				let startNode: Node | null = null;
				let startOffset = 0;
				let endNode: Node | null = null;
				let endOffset = 0;
				for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
					const length = node.textContent?.length ?? 0;
					if (startNode === null && start <= offset + length) {
						startNode = node;
						startOffset = start - offset;
					}
					if (start + anchor.quote.length <= offset + length) {
						endNode = node;
						endOffset = start + anchor.quote.length - offset;
						break;
					}
					offset += length;
				}
				if (startNode === null || endNode === null) return null;
				const range = document.createRange();
				range.setStart(startNode, startOffset);
				range.setEnd(endNode, endOffset);
				return range;
			}
			start = text.indexOf(anchor.quote, start + 1);
		}
		return null;
	};
	let comments = [] as {
		thread: string;
		anchor: PageCommentAnchor;
	}[];
	let layoutFrame = 0;
	const reportLayout = () => {
		layoutFrame = 0;
		const items = [];
		for (const comment of comments) {
			const element = document.querySelector(comment.anchor.path);
			if (element === null) continue;
			const target = comment.anchor.kind === "text" ? textRange(element, comment.anchor) : element;
			if (target === null) continue;
			const rect = target.getBoundingClientRect();
			items.push({
				thread: comment.thread,
				x: Math.max(14, Math.min(innerWidth - 14, rect.right)),
				y: Math.max(14, Math.min(innerHeight - 14, rect.top + Math.min(rect.height / 2, 14))),
			});
		}
		send({ type: "page-comment-layout", items });
	};
	const scheduleLayout = () => {
		if (layoutFrame === 0) layoutFrame = requestAnimationFrame(reportLayout);
	};
	addEventListener("scroll", () => send({ type: "page-scroll", x: scrollX, y: scrollY }), { passive: true });
	addEventListener("scroll", scheduleLayout, { passive: true });
	addEventListener("resize", scheduleLayout, { passive: true });
	addEventListener("load", () => send({ type: "page-ready" }), { once: true });
	addEventListener("mouseup", () => {
		if (selectedAnchor() !== undefined) reportAnchor(null);
	});
	addEventListener(
		"contextmenu",
		(event) => {
			if (!(event.target instanceof Element)) return;
			event.preventDefault();
			reportAnchor(event.target);
		},
		true,
	);
	addEventListener(
		"keydown",
		(event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== "c" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
			const target = event.target;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLSelectElement ||
				(target instanceof HTMLElement && target.isContentEditable)
			)
				return;
			event.preventDefault();
			reportAnchor(target instanceof Element ? target : document.body);
		},
		true,
	);
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
		if (data.type === "page-comment-reveal" && typeof data.thread === "string") {
			const comment = comments.find((candidate) => candidate.thread === data.thread);
			const element = comment === undefined ? null : document.querySelector(comment.anchor.path);
			element?.scrollIntoView({
				block: "center",
				behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
			});
			scheduleLayout();
			return;
		}
		if (data.type === "page-comments-state" && Array.isArray(data.comments)) {
			comments = data.comments;
			scheduleLayout();
			return;
		}
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
