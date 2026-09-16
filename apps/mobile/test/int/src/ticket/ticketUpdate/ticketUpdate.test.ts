import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { ticketDetailKey } from "../../../../../src/ticket/ticketQueries";
import { runTicketUpdate, updateMessage } from "../../../../../src/ticket/ticketUpdate/ticketUpdate";
import { createMobileApp, type MobileApp } from "../../../../testApp";
import { seedTicketScreen } from "../../../../ticket";

let app: MobileApp;

beforeAll(async () => {
	app = await createMobileApp();
});

afterAll(() => app.close());

const setup = async () => {
	const data = await seedTicketScreen(app.seeder);
	const queryClient = new QueryClient();
	const key = ticketDetailKey(data.ticket);
	const ticket = await app.client.tickets.get({ ticket: data.ticket });
	queryClient.setQueryData(key, ticket);
	return { identifier: data.ticket, queryClient, key, ticket };
};

describe("runTicketUpdate", () => {
	test("shows the optimistic row at once and then the response", async () => {
		const { identifier, queryClient, key, ticket } = await setup();
		let seen: Ticket | undefined;
		const pending = runTicketUpdate(queryClient, key, { ...ticket, priority: "urgent" }, async () => {
			seen = queryClient.getQueryData<Ticket>(key);
			return app.client.tickets.update({ ticket: identifier, priority: "urgent", expectedVersion: ticket.version });
		});
		expect(queryClient.getQueryData<Ticket>(key)?.priority).toBe("urgent");
		const result = await pending;
		expect(seen?.priority).toBe("urgent");
		expect(result.version).toBe(ticket.version + 1);
		expect(queryClient.getQueryData<Ticket>(key)).toEqual(result);
	});

	test("a VERSION_CONFLICT puts the current row in the cache and rethrows", async () => {
		const { identifier, queryClient, key, ticket } = await setup();
		const retitled = await app.client.tickets.update({ ticket: identifier, title: "Retitled from the web" });
		const attempt = runTicketUpdate(queryClient, key, { ...ticket, priority: "urgent" }, () =>
			app.client.tickets.update({ ticket: identifier, priority: "urgent", expectedVersion: ticket.version }),
		);
		const error = await attempt.catch((rejection: unknown) => rejection);
		expect(error).toMatchObject({ code: "VERSION_CONFLICT" });
		expect(updateMessage(error)).toBe(`${identifier} changed first. The row shows the other version.`);
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
