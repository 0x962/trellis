import { describe, expect, test } from "bun:test";
import type { Ticket } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { PullRequestsSection } from "./PullRequestsSection";

const textOf = (html: string) => html.replace(/<[^>]*>/g, "");

const ticket = (prs: Ticket["prRows"]): Ticket => ({ prRows: prs }) as Ticket;

const pr = (fields: Partial<Ticket["prRows"][number]> = {}) =>
	({
		id: "01M3368C5GGXKCJE68JPW97VS4",
		number: 304,
		owner: "0x962",
		repo: "trellis",
		url: "https://github.com/0x962/trellis/pull/304",
		title: "Remove the ticket composer",
		state: "open",
		isDraft: false,
		isQueued: false,
		verdict: null,
		...fields,
	}) as Ticket["prRows"][number];

describe("PullRequestsSection", () => {
	test("prints the compact pull request list", () => {
		const html = renderToStaticMarkup(<PullRequestsSection ticket={ticket([pr({ verdict: "approved" })])} />);

		expect(textOf(html)).toContain("Pull requests(1)#304Remove the ticket composer");
		expect(html).toContain('data-pr-glyph="open"');
		expect(html).toContain('data-review-state="approved"');
		expect(html).toContain("You approved this commit");
	});

	test("prints no section when the ticket has no pull request rows", () => {
		const html = renderToStaticMarkup(<PullRequestsSection ticket={ticket([])} />);

		expect(html).toBe("");
	});

	test("draws no verdict mark when the pull request has no verdict", () => {
		const html = renderToStaticMarkup(<PullRequestsSection ticket={ticket([pr()])} />);

		expect(html).not.toContain("data-review-state");
	});

	test("draws the conflict mark with the base branch only on an open pull request that cannot merge", () => {
		const html = (fields: Partial<Ticket["prRows"][number]>) =>
			renderToStaticMarkup(<PullRequestsSection ticket={ticket([pr({ baseRef: "main", ...fields })])} />);

		expect(html({ mergeable: "conflicting" })).toContain('aria-label="Merge conflict with main"');
		expect(html({ mergeable: "mergeable" })).not.toContain("data-pr-conflict");
		expect(html({ mergeable: "conflicting", state: "closed" })).not.toContain("data-pr-conflict");
	});
});
