import { expect, test } from "bun:test";
import { pageDocumentScript } from "./renderScript";

for (const reduced of [true, false]) {
	test(`comment reveal respects reduced motion: ${reduced}`, () => {
		const listeners = new Map<string, (event: unknown) => void>();
		const scrolls: ScrollIntoViewOptions[] = [];
		const restores: ScrollToOptions[] = [];
		const parent = {};
		const element = { scrollIntoView: (options: ScrollIntoViewOptions) => scrolls.push(options) };
		const script = pageDocumentScript("lease-nonce");
		new Function(
			"addEventListener",
			"parent",
			"document",
			"matchMedia",
			"scrollTo",
			"requestAnimationFrame",
			script.slice("<script>".length, -"</script>".length),
		)(
			(name: string, callback: (event: unknown) => void) => listeners.set(name, callback),
			parent,
			{ querySelector: (selector: string) => (selector === "main" ? element : null) },
			(query: string) => {
				expect(query).toBe("(prefers-reduced-motion: reduce)");
				return { matches: reduced };
			},
			(options: ScrollToOptions) => restores.push(options),
			() => 1,
		);
		const message = (data: object) =>
			listeners.get("message")!({ source: parent, data: { nonce: "lease-nonce", ...data } });
		message({
			type: "page-comments-state",
			comments: [{ thread: "thread", anchor: { kind: "element", path: "main" } }],
		});
		message({ type: "page-comment-reveal", thread: "thread" });
		expect(scrolls).toEqual([{ block: "center", behavior: reduced ? "auto" : "smooth" }]);
		message({ type: "page-state", x: 0, y: 900 });
		expect(restores).toEqual([{ left: 0, top: 900, behavior: "instant" }]);
	});
}
