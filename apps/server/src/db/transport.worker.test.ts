import { afterEach, describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { ulid } from "ulid";
import { noGh, signedInGh } from "../../test/helpers/ctx.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import { loadConfig } from "../config.ts";
import type { RequestContext } from "../context.ts";
import { createBus } from "../events/bus.ts";
import { createWorkerTransport, type Runtime, type ServiceTransport } from "./transport.ts";

const transports: ServiceTransport[] = [];

afterEach(async () => {
	for (const transport of transports.splice(0)) await transport.close();
});

const startWorker = async () => {
	const bootId = ulid();
	const bus = createBus({ bootId });
	const config = loadConfig({ TRELLIS_HOME: freshHomeWithDirs() });
	const runtime: Runtime = {
		version: "0.1.0-test",
		bootId,
		gh: noGh,
		ghStatus: signedInGh,
		addresses: async () => ["http://127.0.0.1:4521"],
	};
	const transport = createWorkerTransport({ bus, config, runtime });
	transports.push(transport);
	await transport.start();
	return transport;
};

const ctx = (): RequestContext => ({
	actor: { kind: "human", name: "navid" },
	session: "web-tab",
	reqId: ulid(),
	now: new Date(),
});

describe("worker transport", () => {
	test("the worker transport runs the same service calls as the inline transport", async () => {
		const transport = await startWorker();
		await transport.call("projects.create", ctx(), { key: "CDE", name: "Code" });

		const ticket = (await transport.call("tickets.create", ctx(), { project: "CDE", title: "First" })) as {
			id: string;
			identifier: string;
		};
		const read = (await transport.call("tickets.get", ctx(), { ticket: "CDE-1" })) as { id: string };

		expect(ticket.identifier).toBe("CDE-1");
		expect(read.id).toBe(ticket.id);
	});

	test("a contract error crosses the worker transport unchanged", async () => {
		const transport = await startWorker();

		const error = await transport.call("tickets.get", ctx(), { ticket: "CDE-1" }).then(
			() => null,
			(thrown: unknown) => thrown,
		);

		expect(error).toBeInstanceOf(ORPCError);
		const typed = error as ORPCError<string, unknown>;
		expect(typed.code).toBe("NOT_FOUND");
		expect(typed.status).toBe(404);
		expect(typed.data).toEqual({ kind: "ticket", ref: "CDE-1" });
	});

	test("close stops the worker within five seconds", async () => {
		const transport = await startWorker();
		transports.splice(transports.indexOf(transport), 1);
		const timeout = Bun.sleep(5000).then(() => "timeout" as const);

		const result = await Promise.race([transport.close().then(() => "closed" as const), timeout]);

		expect(result).toBe("closed");
	});
});
