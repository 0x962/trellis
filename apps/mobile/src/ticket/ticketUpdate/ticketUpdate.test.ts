import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { errors, type Ticket } from "@trellis/api";
import { createFakeServer } from "../../../test/fake-server";
import { ticketDetailKey } from "../ticketQueries";
import { runTicketUpdate, updateMessage } from "./ticketUpdate";

const setup = async () => {
	const server = createFakeServer();
	const queryClient = new QueryClient();
	const key = ticketDetailKey("CDE-42");
	const ticket = await server.client.tickets.get({ ticket: "CDE-42" });
	queryClient.setQueryData(key, ticket);
	return { server, queryClient, key, ticket };
};

describe("runTicketUpdate", () => {
	test("shows the optimistic row at once and then the response", async () => {
		const { server, queryClient, key, ticket } = await setup();
		let seen: Ticket | undefined;
		const pending = runTicketUpdate(queryClient, key, { ...ticket, priority: "urgent" }, async () => {
			seen = queryClient.getQueryData<Ticket>(key);
			return server.client.tickets.update({ ticket: "CDE-42", priority: "urgent", expectedVersion: ticket.version });
		});
		expect(queryClient.getQueryData<Ticket>(key)?.priority).toBe("urgent");
		const result = await pending;
		expect(seen?.priority).toBe("urgent");
		expect(result.version).toBe(ticket.version + 1);
		expect(queryClient.getQueryData<Ticket>(key)).toEqual(result);
	});

	test("a VERSION_CONFLICT puts the current row in the cache and rethrows", async () => {
		const { server, queryClient, key, ticket } = await setup();
		const retitled = await server.client.tickets.update({ ticket: "CDE-42", title: "Retitled from the web" });
		const attempt = runTicketUpdate(queryClient, key, { ...ticket, priority: "urgent" }, () =>
			server.client.tickets.update({ ticket: "CDE-42", priority: "urgent", expectedVersion: ticket.version }),
		);
		const error = await attempt.catch((rejection: unknown) => rejection);
		expect(error).toMatchObject({ code: "VERSION_CONFLICT" });
		expect(updateMessage(error)).toBe(errors.VERSION_CONFLICT.message);
		const cached = queryClient.getQueryData<Ticket>(key)!;
		expect(cached.priority).toBe("high");
		expect(cached.version).toBe(retitled.version);
		expect(cached.title).toBe("Retitled from the web");
	});

	test("any other rejection puts the previous row back", async () => {
		const { queryClient, key, ticket } = await setup();
		const attempt = runTicketUpdate(queryClient, key, { ...ticket, priority: "urgent" }, () =>
			Promise.reject(new TypeError("fetch failed")),
		);
		const error = await attempt.catch((rejection: unknown) => rejection);
		expect(error).toBeInstanceOf(TypeError);
		expect(updateMessage(error)).toBe("fetch failed");
		expect(queryClient.getQueryData<Ticket>(key)).toEqual(ticket);
	});
});
