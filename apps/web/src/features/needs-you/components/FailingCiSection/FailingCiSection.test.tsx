import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { Toaster } from "@trellis/ui";
import { createFakeServer, type FakeServer } from "../../../../../test/fake-server";
import { rowOf, waitForElement } from "../../../../../test/inbox";
import { mockMatchMedia } from "../../../../../test/media";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { FailingCiSection } from "./FailingCiSection";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const render = (server: FakeServer) =>
	renderWithProviders(
		<>
			<Toaster />
			<FailingCiSection />
		</>,
		{ path: "/needs-you", actor: "navid", server },
	);

// The seed gives CDE-44 one open pull request whose typecheck job fails.
const seeded = () => createFakeServer();

describe("FailingCiSection", () => {
	// NY-30. The check names live on the pull request, not on the summary.
	test("shows the pull request and its failing check names", async () => {
		render(seeded());
		const row = await rowOf("CDE-44");
		await waitFor(() => expect(row.textContent).toContain("PR #121"));
		expect(row.textContent).toContain("typecheck (desktop)");
	});

	test("links to the open pull request", async () => {
		render(seeded());
		const link = await waitForElement('[data-inbox-row="CDE-44"] [data-open-pr]');
		expect(link.getAttribute("href")).toContain("/pull/121");
	});

	// NY-36. Color alone never carries a failure.
	test("marks a failure with an icon and text beside the color", async () => {
		render(seeded());
		const row = await rowOf("CDE-44");
		const mark = await waitForElement('[data-inbox-row="CDE-44"] [data-ci-state="fail"]');
		expect(mark.getAttribute("class")).toContain("text-danger");
		expect(mark.querySelector("svg")).not.toBeNull();
		expect(row.textContent).toContain("typecheck (desktop)");
	});
});
