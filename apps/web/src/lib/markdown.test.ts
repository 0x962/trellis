import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "./markdown";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html").body;

describe("lib/markdown", () => {
	// WS-34
	test("renderMarkdown renders headings, lists, and code fences", () => {
		const html = renderMarkdown("# Title\n\n- a\n- b\n\n```ts\nx\n```");
		expect(typeof html).toBe("string");
		const body = parse(html);
		expect(body.querySelector("h1")?.textContent).toBe("Title");
		expect([...body.querySelectorAll("ul > li")].map((li) => li.textContent)).toEqual(["a", "b"]);
		expect(body.querySelector("pre > code")?.textContent).toContain("x");
		expect(body.querySelector("script")).toBeNull();
	});

	// WS-35. Descriptions and comments come from agents and from curl, so
	// the read-only view renders nothing that runs.
	test("renderMarkdown strips scripts, event handlers, and javascript: links", () => {
		const html = renderMarkdown(
			'<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[x](javascript:alert(1))',
		);
		const body = parse(html);
		expect(body.querySelector("script")).toBeNull();
		expect(html).not.toMatch(/<script/i);
		for (const element of body.querySelectorAll("*")) {
			for (const attribute of element.getAttributeNames()) {
				expect(attribute.toLowerCase().startsWith("on"), attribute).toBe(false);
			}
		}
		for (const anchor of body.querySelectorAll("a")) {
			expect(anchor.getAttribute("href") ?? "").not.toMatch(/^\s*javascript:/i);
		}
		expect(html).not.toMatch(/javascript:/i);
	});

	// WS-36. An external link opens a new tab without a referrer or an
	// opener. A bare identifier links to its ticket page.
	test("renderMarkdown opens external links safely and autolinks ticket identifiers", () => {
		const body = parse(renderMarkdown("See [the PR](https://github.com/0x962/trellis/pull/7) and CDE-42."));
		const external = body.querySelector('a[href="https://github.com/0x962/trellis/pull/7"]');
		expect(external).not.toBeNull();
		expect(external!.getAttribute("target")).toBe("_blank");
		expect(external!.getAttribute("rel")).toBe("noopener noreferrer");
		const ticket = body.querySelector('a[href="/t/CDE-42"]');
		expect(ticket).not.toBeNull();
		expect(ticket!.textContent).toBe("CDE-42");
	});
});
