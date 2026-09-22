import { describe, expect, test } from "bun:test";
import type { PullRequestEvidence } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { createMarkdownParser } from "../../../lib/markdown";
import { EvidenceDocument } from "./EvidenceDocument";

// The test runtime has no DOM for the sanitizer, so the raw parser stands in.
const render = createMarkdownParser();

const body = [
	"## The Overview tab",
	"",
	"![the Overview tab after the change](/api/evidence/01M3362000000000000000000A/file)",
	"",
	"```sh",
	"bun test apps/web/src",
	"```",
].join("\n");

const evidence: PullRequestEvidence = {
	pullRequestId: "01M2ZWN8R3YRYK14SQD0YHV5TG",
	headSha: "9bf82d2a1c0f4e6b8d3a57c9e21b4a6d05f83e17",
	body,
	actor: { kind: "agent", name: "crisp-fjord" },
	createdAt: "2026-09-21T10:00:00.000Z",
	updatedAt: "2026-09-21T10:00:00.000Z",
};

describe("EvidenceDocument", () => {
	test("renders the Markdown document and nothing else", () => {
		const html = renderToStaticMarkup(<EvidenceDocument evidence={evidence} render={render} />);
		const document = html.slice(html.indexOf('<div class="markdown'));

		expect(html).toContain(">Evidence</span></h2>");
		expect(document).toContain("<h2>The Overview tab</h2>");
		expect(document).toContain(
			'<img src="/api/evidence/01M3362000000000000000000A/file" alt="the Overview tab after the change">',
		);
		expect(document).toContain('<code class="language-sh">bun test apps/web/src');
		// The section holds the header row, then the document, and no other element.
		expect(html.slice(0, html.indexOf('<div class="markdown'))).not.toContain("<p");
		expect(html.endsWith("</div></section>")).toBe(true);
	});

	test("prints the empty state when the agent wrote no evidence", () => {
		const html = renderToStaticMarkup(<EvidenceDocument evidence={null} render={render} />);

		expect(html).toContain("No evidence");
		expect(html).not.toContain('class="markdown');
	});
});
