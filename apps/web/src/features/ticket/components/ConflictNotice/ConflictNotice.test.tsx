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
		await screen.findByText("changed by agent:claude-code: reload or overwrite");
		const gets = server.callsTo("tickets.get").length;
		await user.click(screen.getByRole("button", { name: "Reload" }));
		const key = orpc.tickets.get.queryKey({ input: { ticket: "CDE-42" } });
		await waitFor(() => expect(queryClient.getQueryData<Ticket>(key)!.version).toBe(18));
		await waitFor(() => expect(fieldValue(field())).toBe("Restore the fork pages (agent edit)"));
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onOverwrite).not.toHaveBeenCalled();
		expect(server.callsTo("tickets.get")).toHaveLength(gets);
	});

	// WT-31. Overwrite is the same write with the version guard removed.
	test("Overwrite resends the write without expectedVersion", async () => {
		const user = userEvent.setup();
		const server = serverAt17();
		server.failNext("tickets.update", { code: "VERSION_CONFLICT", data: { current: await conflictAt18(server) } });
		renderTicket("CDE-42", (ticket) => <Title ticket={ticket} />, { path: "/t/CDE-42", server });
		const element = await screen.findByRole("textbox", { name: "Title" });
		await waitFor(() => expect(fieldValue(element)).toContain("Restore the fork pages"));
		await user.clear(element);
		await user.type(element, "Restore every fork page{Enter}");
		await user.click(await screen.findByRole("button", { name: "Overwrite" }));
		await waitFor(() => expect(server.callsTo("tickets.update")).toHaveLength(2));
		const retry = server.callsTo("tickets.update")[1]!.input as Record<string, unknown>;
		expect(retry.title).toBe("Restore every fork page");
		expect(retry).not.toHaveProperty("expectedVersion");
		await waitFor(() => expect(screen.queryByText(/reload or overwrite/)).toBeNull());
	});
});
