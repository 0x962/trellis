import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Ticket } from "@trellis/api";
import { conflictAt18, serverAt17 } from "../../../../../test/conflict";
import { fieldValue, renderTicket } from "../../../../../test/ticketHost";
import { Title } from "../../Title";
import { ConflictNotice } from "./ConflictNotice";

beforeEach(() => localStorage.clear());

const field = () => screen.getByRole("textbox", { name: "Title" });

describe("features/ticket/components/ConflictNotice", () => {
	// WT-30. The 412 carries the current row, so no refetch is needed: the
	// notice writes that row into the cache and the title re-renders from it.
	test("Reload takes the current row from the error and closes the notice", async () => {
		const user = userEvent.setup();
		const server = serverAt17();
		const current = await conflictAt18(server);
		const onClose = mock(() => {});
		const onOverwrite = mock(() => {});
		const { queryClient, orpc } = renderTicket(
			"CDE-42",
			(ticket) => (
				<>
					<Title ticket={ticket} />
					<ConflictNotice current={current} onOverwrite={onOverwrite} onClose={onClose} />
				</>
			),
			{ path: "/t/CDE-42", server },
		);
		const notice = await screen.findByRole("alert");
		expect(notice.textContent).toContain("claude-code");
		expect(notice.textContent).toContain("changed this ticket 1h ago. Your edit is not saved.");
		expect(notice.textContent).not.toContain("agent:claude-code");
		const gets = server.callsTo("tickets.get").length;
		await user.click(screen.getByRole("button", { name: "Use their version" }));
		const key = orpc.tickets.get.queryKey({ input: { ticket: "CDE-42" } });
		await waitFor(() => expect(queryClient.getQueryData<Ticket>(key)!.version).toBe(18));
		await waitFor(() => expect(fieldValue(field())).toBe("Restore the fork pages (agent edit)"));
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onOverwrite).not.toHaveBeenCalled();
		expect(server.callsTo("tickets.get")).toHaveLength(gets);
	});

	// WT-31. Keep mine is the same write with the version guard removed. It
	// replaces the other actor's edit, so it asks first.
	test("Keep mine resends the write without expectedVersion", async () => {
		const user = userEvent.setup();
		const server = serverAt17();
		server.failNext("tickets.update", { code: "VERSION_CONFLICT", data: { current: await conflictAt18(server) } });
		renderTicket("CDE-42", (ticket) => <Title ticket={ticket} />, { path: "/t/CDE-42", server });
		const element = await screen.findByRole("textbox", { name: "Title" });
		await waitFor(() => expect(fieldValue(element)).toContain("Restore the fork pages"));
		await user.clear(element);
		await user.type(element, "Restore every fork page{Enter}");
		await user.click(await screen.findByRole("button", { name: "Keep mine" }));
		expect(await screen.findByText("Replace claude-code's edit?")).toBeDefined();
		expect(server.callsTo("tickets.update")).toHaveLength(1);
		await user.click(screen.getByRole("button", { name: "Replace" }));
		await waitFor(() => expect(server.callsTo("tickets.update")).toHaveLength(2));
		const retry = server.callsTo("tickets.update")[1]!.input as Record<string, unknown>;
		expect(retry.title).toBe("Restore every fork page");
		expect(retry).not.toHaveProperty("expectedVersion");
		await waitFor(() => expect(screen.queryByText(/Your edit is not saved/)).toBeNull());
	});

	// A row with no last actor still names who changed it in words.
	test("a row with no last actor reads as another actor", async () => {
		const server = serverAt17();
		const current = { ...(await conflictAt18(server)), lastActor: null };
		renderTicket("CDE-42", () => <ConflictNotice current={current} onOverwrite={() => {}} onClose={() => {}} />, {
			path: "/t/CDE-42",
			server,
		});
		expect((await screen.findByRole("alert")).textContent).toContain("Another actor changed this ticket.");
	});
});
