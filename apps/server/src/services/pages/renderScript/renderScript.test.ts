import { expect, test } from "bun:test";
import { frameRelayScript, pageDocumentScript } from "./renderScript";

const sourceOf = (script: string) => script.slice("<script>".length, -"</script>".length);

test("the Page runtime emits anchors and pin positions without a mutation message", () => {
	const script = pageDocumentScript("nonce");
	const source = sourceOf(script);
	expect(() => new Function(source)).not.toThrow();
	expect(source).toContain("page-comment-anchor");
	expect(source).toContain("page-comment-layout");
	expect(source).toContain("page-comment-reveal");
	expect(source).toContain("prefers-reduced-motion: reduce");
	expect(source).not.toContain("page-comment-resolve");
	expect(source).not.toContain("page-comment-delete");
});

test("the frame runtime only relays messages that carry its nonce", () => {
	const script = frameRelayScript("nonce");
	const source = script.slice(script.indexOf(">") + 1, -"</script>".length);
	expect(() => new Function(source)).not.toThrow();
	expect(source).toContain("event.data?.nonce !== nonce");
});
