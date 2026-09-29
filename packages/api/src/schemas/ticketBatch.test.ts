import { expect, test } from "bun:test";
import { TicketDeleteManyInputSchema, TicketUpdateManyInputSchema } from "./ticketWrite.ts";

for (const schema of [TicketUpdateManyInputSchema, TicketDeleteManyInputSchema]) {
	test(`${schema === TicketUpdateManyInputSchema ? "update" : "delete"} accepts complete batches and rejects invalid references`, () => {
		const tickets = Array.from({ length: 201 }, (_, index) => `big-${index + 1}`);
		expect(schema.parse({ tickets }).tickets).toEqual(tickets.map((ref) => ref.toUpperCase()));
		expect(schema.safeParse({ tickets: [] }).success).toBeFalse();
		expect(schema.safeParse({ tickets: ["BIG-1", "big-1"] }).success).toBeFalse();
		expect(schema.safeParse({ tickets: [...tickets, "invalid"] }).success).toBeFalse();
	});
}
