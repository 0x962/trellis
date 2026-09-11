import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestServer, type TestServer } from "../../../../test/server";
import { renderTicket, settle } from "../../../../test/ticketHost";
import { markStartedKey, StartWithAgent } from "./StartWithAgent";

beforeEach(() => localStorage.clear());

const mount = (server: TestServer) =>
	renderTicket("CDE-42", (ticket) => <StartWithAgent ticket={ticket} />, { path: "/t/CDE-42", server });

// Opens the dropdown and clicks one of its copy actions.
const pick = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
	await user.click(await screen.findByRole("button", { name: "Start with agent options" }));
	await user.click(await screen.findByRole("button", { name }));
};

const clipboard = () => navigator.clipboard.readText();

describe("features/agent/StartWithAgent: copy targets", () => {
	// The prompt is the claude command the settings template builds. It
	// needs no brief read, and it never moves the ticket, even with the
	// box checked.
	test("Copy command only copies the claude command from the settings template", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		server.state.settings.startWithAgentTemplate = 'claude --model opus "$(trellis brief {brief})"';
		localStorage.setItem(markStartedKey, "1");
		mount(server);
		await pick(user, "Copy command only");
		await waitFor(async () => expect(await clipboard()).toBe('claude --model opus "$(trellis brief CDE-42)"'));
		await settle();
		expect(server.callsTo("brief.get")).toHaveLength(0);
		expect(server.callsTo("tickets.move")).toHaveLength(0);
	});

	// The brief is the markdown `trellis brief CDE-42` prints.
	test("Copy brief as markdown copies the brief markdown", async () => {
		const user = userEvent.setup();
		const server = createTestServer();
		mount(server);
		await pick(user, "Copy brief as markdown");
		await waitFor(async () => expect(await clipboard()).toStartWith("# CDE-42"));
		expect(await clipboard()).toContain("Restore the fork pages after the upstream 1.27 merge");
		expect(server.callsTo("brief.get")).toHaveLength(1);
	});
});
