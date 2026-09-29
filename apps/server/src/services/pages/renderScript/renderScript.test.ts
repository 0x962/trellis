import { afterEach, beforeEach, expect, test } from "bun:test";
import { frameRelayScript, pageDocumentScript } from "./renderScript";

const sourceOf = (script: string) => script.slice("<script>".length, -"</script>".length);

const observers = {
	MutationObserver: globalThis.MutationObserver,
	IntersectionObserver: globalThis.IntersectionObserver,
};
beforeEach(() => {
	globalThis.MutationObserver = class {
		observe() {}
		takeRecords() {
			return [];
		}
	} as unknown as typeof MutationObserver;
	globalThis.IntersectionObserver = class {} as unknown as typeof IntersectionObserver;
});
afterEach(() => Object.assign(globalThis, observers));

test("the Page runtime emits anchors and pin positions without a mutation message", () => {
	const script = pageDocumentScript("nonce");
	const source = sourceOf(script);
	expect(() => new Function(source)).not.toThrow();
	expect(source).toContain("page-comment-anchor");
	expect(source).toContain("page-comment-anchor-error");
	expect(source).toContain("Select 2,000 characters or fewer.");
	expect(source).toContain("page-comment-layout");
	expect(source).toContain("page-comment-reveal");
	expect(source).toContain("prefers-reduced-motion: reduce");
	expect(source).not.toContain("page-comment-resolve");
	expect(source).not.toContain("page-comment-delete");
	expect(source).not.toContain("quote ??");
	expect(source).not.toContain("prefix ??");
	expect(source).not.toContain("suffix ??");
});

test("an oversized selection reports its limit without an element anchor", () => {
	const listeners = new Map<string, EventListener>();
	const sent: object[] = [];
	class FakeElement {
		localName = "main";
		parentElement = null;
		previousElementSibling = null;
	}
	const root = new FakeElement();
	const saved = {
		Element: globalThis.Element,
		addEventListener: globalThis.addEventListener,
		document: globalThis.document,
		getSelection: globalThis.getSelection,
		parent: globalThis.parent,
	};
	globalThis.Element = FakeElement as unknown as typeof Element;
	globalThis.document = { documentElement: {} } as Document;
	globalThis.parent = { postMessage: (message: object) => sent.push(message) } as unknown as Window;
	globalThis.getSelection = () =>
		({
			rangeCount: 1,
			isCollapsed: false,
			toString: () => "x".repeat(2001),
			getRangeAt: () => ({ commonAncestorContainer: root }),
		}) as unknown as Selection;
	globalThis.addEventListener = ((type: string, listener: EventListener) => {
		listeners.set(type, listener);
	}) as typeof addEventListener;
	try {
		new Function(sourceOf(pageDocumentScript("nonce")))();
		listeners.get("contextmenu")!({ target: root, preventDefault: () => {} } as unknown as Event);
		expect(sent).toEqual([
			{ type: "page-comment-anchor-error", message: "Select 2,000 characters or fewer.", nonce: "nonce" },
		]);
	} finally {
		globalThis.Element = saved.Element;
		globalThis.addEventListener = saved.addEventListener;
		globalThis.document = saved.document;
		globalThis.getSelection = saved.getSelection;
		globalThis.parent = saved.parent;
	}
});

test("the Page runtime reports every pin in the visible region", () => {
	const listeners = new Map<string, EventListener[]>();
	const frames: FrameRequestCallback[] = [];
	const sent: { type: string; items?: { thread: string }[] }[] = [];
	let queryCount = 0;
	let observer: FakeIntersectionObserver | null = null;
	let pendingChanges: MutationRecord[] = [];
	const reveal = { target: null as FakeElement | null };
	class FakeElement {
		localName = "p";
		parentElement = null;
		previousElementSibling = null;
		constructor(readonly index: number) {}
		getBoundingClientRect() {
			const top = this.index % 100;
			return { bottom: top + 10, height: 10, left: 20, right: 40, top } as DOMRect;
		}
		contains(node: Node) {
			return (node as unknown) === this;
		}
		scrollIntoView() {
			reveal.target = this;
		}
	}
	class FakeIntersectionObserver {
		readonly elements: FakeElement[] = [];
		constructor(readonly callback: IntersectionObserverCallback) {
			observer = this;
		}
		disconnect() {
			this.elements.length = 0;
		}
		observe(element: Element) {
			this.elements.push(element as unknown as FakeElement);
		}
		unobserve(element: Element) {
			this.elements.splice(this.elements.indexOf(element as unknown as FakeElement), 1);
		}
	}
	const elements = Array.from({ length: 501 }, (_, index) => new FakeElement(index));
	const byPath = new Map(elements.map((element) => [`p-${element.index}`, element]));
	const parent = { postMessage: (message: { type: string; items?: { thread: string }[] }) => sent.push(message) };
	const saved = {
		Element: globalThis.Element,
		IntersectionObserver: globalThis.IntersectionObserver,
		addEventListener: globalThis.addEventListener,
		document: globalThis.document,
		innerHeight: globalThis.innerHeight,
		innerWidth: globalThis.innerWidth,
		matchMedia: globalThis.matchMedia,
		parent: globalThis.parent,
		requestAnimationFrame: globalThis.requestAnimationFrame,
		scrollX: globalThis.scrollX,
		scrollY: globalThis.scrollY,
	};
	globalThis.Element = FakeElement as unknown as typeof Element;
	globalThis.MutationObserver = class {
		observe() {}
		takeRecords() {
			const records = pendingChanges;
			pendingChanges = [];
			return records;
		}
	} as unknown as typeof MutationObserver;
	globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
	globalThis.addEventListener = ((type: string, listener: EventListener) => {
		listeners.set(type, [...(listeners.get(type) ?? []), listener]);
	}) as typeof addEventListener;
	globalThis.document = {
		documentElement: new FakeElement(-1),
		querySelector: (path: string) => {
			queryCount += 1;
			return byPath.get(path) ?? null;
		},
	} as unknown as Document;
	globalThis.innerHeight = 800;
	globalThis.innerWidth = 1200;
	globalThis.matchMedia = (() => ({ matches: true })) as unknown as typeof matchMedia;
	globalThis.parent = parent as unknown as Window;
	globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
		frames.push(callback);
		return frames.length;
	}) as typeof requestAnimationFrame;
	globalThis.scrollX = 0;
	globalThis.scrollY = 0;
	const dispatch = (type: string, event: object) => {
		for (const listener of listeners.get(type) ?? []) listener(event as Event);
	};
	const flush = () => {
		for (const callback of frames.splice(0)) callback(0);
	};
	const layouts = () => sent.filter((message) => message.type === "page-comment-layout");
	try {
		new Function(sourceOf(pageDocumentScript("nonce")))();
		const comments = elements.map((element) => ({
			thread: `thread-${element.index}`,
			anchor: { kind: "element", path: `p-${element.index}` },
		}));
		dispatch("message", {
			source: parent,
			data: { type: "page-comments-state", nonce: "nonce", comments },
		});
		flush();
		expect(queryCount).toBe(501);
		observer!.callback(
			elements.map((target) => ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry),
			observer as unknown as IntersectionObserver,
		);
		flush();
		expect(layouts().at(-1)?.items).toHaveLength(501);
		expect(layouts().at(-1)?.items?.at(-1)?.thread).toBe("thread-500");
		dispatch("scroll", {});
		flush();
		expect(queryCount).toBe(501);
		expect(layouts().at(-1)?.items).toHaveLength(501);
		for (const comment of comments) {
			dispatch("message", {
				source: parent,
				data: { type: "page-comment-reveal", nonce: "nonce", thread: comment.thread },
			});
			flush();
			expect(
				layouts()
					.at(-1)
					?.items?.some(({ thread }) => thread === comment.thread),
			).toBe(true);
		}
		const replacement = new FakeElement(501);
		byPath.set("p-0", replacement);
		pendingChanges = [{ type: "childList", target: document } as unknown as MutationRecord];
		dispatch("message", {
			source: parent,
			data: { type: "page-comment-reveal", nonce: "nonce", thread: "thread-0" },
		});
		flush();
		expect(reveal.target).toBe(replacement);
		expect(observer!.elements).toContain(replacement);
		expect(observer!.elements).not.toContain(elements[0]!);
		expect(queryCount).toBe(1002);
		dispatch("scroll", {});
		flush();
		expect(queryCount).toBe(1002);
	} finally {
		globalThis.Element = saved.Element;
		globalThis.IntersectionObserver = saved.IntersectionObserver;
		globalThis.addEventListener = saved.addEventListener;
		globalThis.document = saved.document;
		globalThis.innerHeight = saved.innerHeight;
		globalThis.innerWidth = saved.innerWidth;
		globalThis.matchMedia = saved.matchMedia;
		globalThis.parent = saved.parent;
		globalThis.requestAnimationFrame = saved.requestAnimationFrame;
		globalThis.scrollX = saved.scrollX;
		globalThis.scrollY = saved.scrollY;
	}
});

test("the frame runtime only relays messages that carry its nonce", () => {
	const script = frameRelayScript("nonce");
	const source = script.slice(script.indexOf(">") + 1, -"</script>".length);
	expect(() => new Function(source)).not.toThrow();
	expect(source).toContain("event.data?.nonce !== nonce");
});
