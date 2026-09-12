import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PullRequests } from "../../../../../../../../src/features/prs/PullRequests/PullRequests";
import { mockMatchMedia } from "../../../../../../../media";
import { callsTo, ghReady, lastCallTo, summaryOf } from "../../../../../../../prs";
import { renderWithProviders } from "../../../../../../../renderWithProviders";
import { createTestServer, type TestServer } from "../../../../../../../server";

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	mockMatchMedia(false);
});

const url = "https://github.com/acme/web/pull/900";

const renderSection = async (server: TestServer, identifier: string) => {
	const ticket = await summaryOf(server, identifier);
	return renderWithProviders(<PullRequests ticket={ticket} />, { path: `/t/${identifier}`, actor: "dana", server });
};

// The field shows after a click on the Link PR button in the section header.
const field = async () => {
	const open = screen.queryByRole("textbox", { name: /link pr/i });
	if (open !== null) return open;
	await userEvent.setup().click(await screen.findByRole("button", { name: "Link PR" }));
	return await screen.findByRole("textbox", { name: /link pr/i });
};

const submit = async () => await screen.findByRole("button", { name: /^link$/i });

const linkError = () => document.querySelector("[data-link-error]");

const rows = () => document.querySelectorAll("[data-pr-row]");

describe("LinkPrField", () => {
	// PR-32
	test("links a pasted pull request URL and shows the new row", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await ghReady(server, { number: 900, title: "A pull request", headRef: "pr-900" });
		await renderSection(server, "CDE-47");
		await user.type(await field(), url);
		await user.click(await submit());
		await waitFor(() => expect(callsTo(server, "pullRequests.link")).toHaveLength(1));
		expect(lastCallTo(server, "pullRequests.link")!.input).toEqual({ ticket: "CDE-47", url });
		await waitFor(() => expect(rows()).toHaveLength(1));
		expect(document.body.textContent).toContain("#900");
	});

	// PR-33. The next paste needs no click.
	test("clears the field after a successful link", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await ghReady(server, { number: 900, title: "A pull request", headRef: "pr-900" });
		await renderSection(server, "CDE-47");
		const input = await field();
		await user.type(input, url);
		await user.click(await submit());
		await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
		expect(document.activeElement).toBe(input);
	});

	// PR-34
	test("shows INVALID_PR_URL inline and keeps the typed text", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await ghReady(server, { number: 900, title: "A pull request", headRef: "pr-900" });
		await renderSection(server, "CDE-47");
		const input = await field();
		await user.type(input, "https://github.com/o/r");
		await user.click(await submit());
		await waitFor(() => expect(linkError()).not.toBeNull());
		expect(linkError()!.getAttribute("role")).toBe("alert");
		expect(linkError()!.textContent).toContain("The URL is not a GitHub pull request URL.");
		expect((input as HTMLInputElement).value).toBe("https://github.com/o/r");
		expect(rows()).toHaveLength(0);
	});

	// PR-35. A link with gh away keeps the link and marks the card stale, so
	// the ticket never loses the pull request over an outage. The stale marker
	// carries the gh failure in its title.
	test("links the pull request and states the gh message when gh cannot answer", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await server.removeGh();
		await renderSection(server, "CDE-47");
		await user.type(await field(), url);
		await user.click(await submit());
		await waitFor(() => expect(rows()).toHaveLength(1));
		expect(linkError()).toBeNull();
		const [linked] = await server.client.pullRequests.list({ ticket: "CDE-47" });
		expect(linked!.number).toBe(900);
		expect(linked!.fetchError).toContain("gh");
		const stale = await waitFor(() => {
			const marker = document.querySelector("[data-pr-stale]");
			if (marker === null) throw new Error("No stale marker on the card.");
			return marker;
		});
		expect(stale.getAttribute("title")).toContain("gh");
	});

	// PR-36
	test("disables the submit until the field holds a URL", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		await ghReady(server, { number: 900, title: "A pull request", headRef: "pr-900" });
		await renderSection(server, "CDE-47");
		const input = await field();
		expect((await submit()).hasAttribute("disabled")).toBe(true);
		await user.type(input, url);
		expect((await submit()).hasAttribute("disabled")).toBe(false);
	});
});
