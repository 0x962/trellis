import { expect, test } from "bun:test";
import { frameRelayScript, pageDocumentScript } from "./renderScript";

const sourceOf = (script: string) => script.slice("<script>".length, -"</script>".length);

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

test("the frame runtime only relays messages that carry its nonce", () => {
	const script = frameRelayScript("nonce");
	const source = script.slice(script.indexOf(">") + 1, -"</script>".length);
	expect(() => new Function(source)).not.toThrow();
	expect(source).toContain("event.data?.nonce !== nonce");
});
