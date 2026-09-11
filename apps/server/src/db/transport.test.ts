import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { noGh, signedInGh } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import { loadConfig } from "../config.ts";
import type { RequestContext } from "../context.ts";
import { createBus } from "../events/bus.ts";
import { createInlineTransport, type InlineTransport, type Runtime, type ServiceTransport } from "./transport.ts";

// The inline transport runs a service on the calling thread: one withTx per
// call, the events flushed to the bus after the commit. It implements the
// same ServiceTransport interface as the worker transport, so index.ts
// picks one by config.dbInline and the app never knows which it got.

let h: TestDb;
let transport: InlineTransport;
let received: TrellisEvent[];
let bus: ReturnType<typeof createBus>;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	const bootId = ulid();
	bus = createBus({ bootId });
	received = [];
	bus.subscribe((entry) => void received.push(entry.event));
	const config = loadConfig({ TRELLIS_HOME: freshHomeWithDirs(), TRELLIS_DB_INLINE: "true" });
	const runtime: Runtime = {
		version: "0.1.0-test",
		bootId,
		gh: noGh,
		ghStatus: signedInGh,
		addresses: async () => ["http://127.0.0.1:4521"],
	};
	transport = createInlineTransport({ db: h.db, bus, config, runtime });
	await transport.start();
});
afterAll(() => h.close());

const ctx = (): RequestContext => ({
	actor: { kind: "human", name: "navid" },
	session: null,
	reqId: ulid(),
	now: new Date(),
});

const count = async (table: string) =>
	(await h.db.execute(sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`)).rows[0]!.n as number;

describe("inline transport", () => {
	test("the inline transport runs a service in one transaction", async () => {
		await transport.call("projects.create", ctx(), { key: "CDE", name: "Code" });

		const ticket = (await transport.call("tickets.create", ctx(), { project: "CDE", title: "First" })) as {
			identifier: string;
		};

		expect(ticket.identifier).toBe("CDE-1");
		expect(await count("tickets")).toBe(1);
		expect(await count("activity")).toBeGreaterThan(0);
	});

	test("a contract error crosses the transport unchanged", async () => {
		const call = transport.call("tickets.get", ctx(), { ticket: "CDE-1" });

		const error = await call.then(
			() => null,
			(thrown: unknown) => thrown,
		);

		expect(error).toBeInstanceOf(ORPCError);
		const typed = error as ORPCError<string, unknown>;
		expect(typed.code).toBe("NOT_FOUND");
		expect(typed.status).toBe(404);
		expect(typed.data).toEqual({ kind: "ticket", ref: "CDE-1" });
	});

	test("the transport flushes events after the commit", async () => {
		const seenInsideTx: number[] = [];
		const spy = h.db.$client.execProtocolStream.bind(h.db.$client);
		Object.defineProperty(h.db.$client, "execProtocolStream", {
			value: async (message: Uint8Array, options: unknown) => {
				if (new TextDecoder().decode(message).includes("INSERT INTO projects")) seenInsideTx.push(received.length);
				return spy(message, options as never);
			},
			configurable: true,
			writable: true,
		});

		await transport.call("projects.create", ctx(), { key: "CDE", name: "Code" }).finally(() => {
			Reflect.deleteProperty(h.db.$client, "execProtocolStream");
		});

		expect(seenInsideTx).toEqual([0]);
		expect(received.map((event) => event.type)).toEqual(["project.created"]);
	});

	test("a rollback drops the queued events", async () => {
		await transport.call("projects.create", ctx(), { key: "CDE", name: "Code" });
		received.length = 0;

		const call = transport.call("tickets.create", ctx(), { project: "CDE", title: "First", status: "no-such-status" });

		await expect(call).rejects.toBeInstanceOf(ORPCError);
		expect(await count("tickets")).toBe(0);
		expect(received).toEqual([]);
	});

	test("the inline transport implements the whole ServiceTransport interface", () => {
		const checked: ServiceTransport = transport;

		expect(typeof checked.call).toBe("function");
		expect(typeof checked.start).toBe("function");
		expect(typeof checked.close).toBe("function");
		expect(Object.keys(checked).sort()).toEqual(["call", "close", "start"]);
	});

	test("a service query through the given tx never deadlocks", async () => {
		await transport.call("projects.create", ctx(), { key: "CDE", name: "Code" });

		const ticket = (await transport.call("tickets.create", ctx(), { project: "CDE", title: "First" })) as {
			id: string;
		};
		const read = (await transport.call("tickets.get", ctx(), { ticket: "CDE-1" })) as { id: string };

		expect(read.id).toBe(ticket.id);
	}, 2000);
});
