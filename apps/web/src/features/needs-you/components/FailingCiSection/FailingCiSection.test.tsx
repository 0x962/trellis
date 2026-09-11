import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "@trellis/ui";
import { mockClipboard, rowOf, setTemplate, waitForElement } from "../../../../../test/inbox";
import { mockMatchMedia } from "../../../../../test/media";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { createTestServer, type TestServer } from "../../../../../test/server";
import { FailingCiSection } from "./FailingCiSection";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const render = (server: TestServer) =>
	renderWithProviders(
		<>
			<Toaster />
			<FailingCiSection />
		</>,
		{ path: "/needs-you", actor: "navid", server },
	);

// The seed gives CDE-44 one open pull request whose typecheck job fails.
const seeded = async () => {
	const server = createTestServer();
	await setTemplate(server, 'claude "{brief}"');
	return server;
};

const rerun = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(await waitForElement('[data-inbox-row="CDE-44"] button[data-rerun]'));
};

// buildAgentCommand is the one builder of the command: `{brief}` becomes the
// ID, and the appended text goes inside the quoted brief argument.
const expected = 'claude "CDE-44 Fix the failed checks: typecheck (desktop)."';

describe("FailingCiSection", () => {
	// NY-30. The check names live on the pull request, not on the summary.
	test("shows the pull request and its failing check names", async () => {
		render(await seeded());
		const row = await rowOf("CDE-44");
		await waitFor(() => expect(row.textContent).toContain("PR #121"));
		expect(row.textContent).toContain("typecheck (desktop)");
	});

	// NY-31. The command names the work: the brief plus the checks to fix.
	test("copies the agent command with the failing check names appended", async () => {
		const user = userEvent.setup();
		const clipboard = mockClipboard();
		render(await seeded());
		await rerun(user);
		await waitFor(() => expect(clipboard.written).toEqual([expected]));
	});

	// NY-34. The toast shows what was copied, so a paste needs no guess.
	test("toasts the copied command in mono", async () => {
		const user = userEvent.setup();
		mockClipboard();
		render(await seeded());
		await rerun(user);
		expect(await screen.findByText("Copied the command. Paste it in a terminal.")).toBeDefined();
		const command = await screen.findByText(expected);
		expect(command.getAttribute("class")).toContain("font-mono");
	});

	// NY-35. A refused clipboard still hands the command over.
	test("shows the command in an error toast when the clipboard refuses", async () => {
		const user = userEvent.setup();
		mockClipboard(true);
		render(await seeded());
		await rerun(user);
		const command = await screen.findByText(expected);
		expect(command.getAttribute("class")).toContain("select-all");
		expect(screen.queryByText("Copied the command. Paste it in a terminal.")).toBeNull();
	});

	// NY-36. Color alone never carries a failure.
	test("marks a failure with an icon and text beside the color", async () => {
		render(await seeded());
		const row = await rowOf("CDE-44");
		const mark = await waitForElement('[data-inbox-row="CDE-44"] [data-ci-state="fail"]');
		expect(mark.getAttribute("class")).toContain("text-danger");
		expect(mark.querySelector("svg")).not.toBeNull();
		expect(row.textContent).toContain("typecheck (desktop)");
	});
});
