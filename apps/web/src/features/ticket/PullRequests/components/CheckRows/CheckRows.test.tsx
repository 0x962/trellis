import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Check, LinkedPullRequest } from "@trellis/api";
import { createFakeServer } from "../../../../../../test/fake-server";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import { PrRow } from "../PrRow";
import { CheckRows } from "./CheckRows";

const check = (name: string, bucket: Check["bucket"], workflow = "ci"): Check => ({
	name,
	workflow,
	bucket,
	link: `https://github.com/canary-technologies-corp/de/actions/runs/${encodeURIComponent(name)}`,
});

// One failing check in third place, so the sort is what puts it first.
const checks = [
	check("lint", "pass"),
	check("test (host-service)", "pass"),
	check("typecheck (desktop)", "fail"),
	check("build (macos-arm64)", "pass", "release"),
];

const assertRows = (rows: HTMLElement[]) => {
	expect(rows).toHaveLength(4);
	expect(rows[0]!.textContent).toContain("typecheck (desktop)");
	expect(within(rows[0]!).getByRole("img", { name: /fail/i })).toBeDefined();
	expect(within(rows[1]!).getByRole("img", { name: /pass/i })).toBeDefined();
	for (const row of rows) {
		const source = checks.find((entry) => row.textContent!.includes(entry.name))!;
		expect(row.textContent).toContain(source.workflow!);
		const link = within(row).getByRole("link", { name: "Open" });
		expect(link.getAttribute("href")).toBe(source.link);
		expect(link.getAttribute("target")).toBe("_blank");
	}
};

describe("features/ticket/PullRequests/components/CheckRows", () => {
	// WT-66. The failing check is what a person came to see, so it leads.
	// Enter on the collapsed row is what reveals the check rows.
	test("expands to per-check rows with failures first", async () => {
		const user = userEvent.setup();
		const server = createFakeServer();
		const ticket = await server.client.tickets.get({ ticket: "CDE-42" });
		const pr: LinkedPullRequest = { ...ticket.prs[0]!, checks, ciState: "fail" };
		renderWithProviders(<PrRow pr={pr} ticket={{ ...ticket, prs: [pr] }} />, {
			path: "/t/CDE-42",
			actor: "navid",
			server,
		});
		const row = screen.getByRole("button", { name: /#118/ });
		expect(screen.queryByText("typecheck (desktop)")).toBeNull();
		row.focus();
		await user.keyboard("{Enter}");
		const list = await screen.findByRole("list", { name: /checks/i });
		assertRows(within(list).getAllByRole("listitem"));
	});

	// The rows alone, sorted the same way.
	test("renders the check rows failures first on their own", () => {
		render(<CheckRows checks={checks} />);
		assertRows(screen.getAllByRole("listitem"));
	});
});
