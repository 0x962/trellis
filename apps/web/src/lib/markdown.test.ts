import { describe, expect, test } from "bun:test";
import { createMarkdownRenderer, renderMarkdown } from "./markdown";

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

	// An image pasted into a description or a comment is an attachment. Its
	// markdown names the server's relative file URL, so the image keeps it.
	test("renderMarkdown keeps the src of an attachment image and drops other relative sources", () => {
		const id = "01J9ZK3Q8V2M4N6P7R8S9T0V1W";
		const body = parse(renderMarkdown(`![board.png](/api/attachments/${id}/file)\n\n![x](/etc/passwd)`));
		const [attachment, other] = [...body.querySelectorAll("img")];
		expect(attachment!.getAttribute("src")).toBe(`/api/attachments/${id}/file`);
		expect(attachment!.getAttribute("alt")).toBe("board.png");
		expect(other!.hasAttribute("src")).toBe(false);
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

	// A chat body names agents, people, and roles with `@`. The chat renderer
	// marks a known name and leaves an unknown one, a mail address, and a
	// code span alone.
	test("createMarkdownRenderer marks the mentions it knows", () => {
		const render = createMarkdownRenderer({ mentions: ["Careful reviewer", "Careful", "manager", "dana"] });
		const body = parse(render("@Careful reviewer and @manager: see `@dana` or mail a@b.c, not @nobody"));
		expect([...body.querySelectorAll("mark.mention")].map((mark) => mark.textContent)).toEqual([
			"@Careful reviewer",
			"@manager",
		]);
		expect(body.querySelector("code")?.textContent).toBe("@dana");
		expect(body.textContent).toContain("@nobody");
	});

	test("the chat renderer keeps line breaks and a chat attachment image", () => {
		const render = createMarkdownRenderer({ mentions: [] });
		const id = "01J9ZK3Q8V2M4N6P7R8S9T0V1W";
		const body = parse(render(`one\ntwo\n\n![shot.png](/api/chat/attachments/${id}/file)`));
		expect(body.querySelector("br")).not.toBeNull();
		expect(body.querySelector("img")?.getAttribute("src")).toBe(`/api/chat/attachments/${id}/file`);
	});
});
