import { afterEach, describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { ulid } from "ulid";
import { loadConfig } from "../../../../src/config.ts";
import type { RequestContext } from "../../../../src/context.ts";
import { createWorkerTransport, type Runtime, type ServiceTransport } from "../../../../src/db/transport.ts";
import { createBus } from "../../../../src/events/bus.ts";
import { noGh, signedInGh } from "../../../helpers/ctx.ts";
import { freshHomeWithDirs } from "../../../helpers/home.ts";

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
	actor: { kind: "human", name: "dana" },
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

	// The second start reports the boot of its own worker, not the answer the
	// first worker gave: the migrations already ran, so it applies none.
	test("a closed transport starts again and answers on its new worker", async () => {
		const transport = await startWorker();
		await transport.call("projects.create", ctx(), { key: "CDE", name: "Code" });
		await transport.call("tickets.create", ctx(), { project: "CDE", title: "First" });

		await transport.close();
		const restarted = await transport.start();
		const read = (await transport.call("tickets.get", ctx(), { ticket: "CDE-1" })) as { title: string };

		expect(restarted.applied).toBe(0);
		expect(read.title).toBe("First");
	});

	// The start builds the transport of the worker, so a call that arrives
	// before the boot ends waits for it instead of reading an empty one.
	test("a call sent during the boot waits for the boot", async () => {
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

		const started = transport.start();
		const created = transport.call("projects.create", ctx(), { key: "CDE", name: "Code" });
		await started;

		expect(await created).toMatchObject({ key: "CDE" });
	});

	test("a second close of a closed transport returns", async () => {
		const transport = await startWorker();
		transports.splice(transports.indexOf(transport), 1);
		await transport.close();

		const result = await Promise.race([
			transport.close().then(() => "closed" as const),
			Bun.sleep(5000).then(() => "timeout" as const),
		]);

		expect(result).toBe("closed");
	});

	test("close stops the worker within five seconds", async () => {
		const transport = await startWorker();
		transports.splice(transports.indexOf(transport), 1);
		const timeout = Bun.sleep(5000).then(() => "timeout" as const);

		const result = await Promise.race([transport.close().then(() => "closed" as const), timeout]);

		expect(result).toBe("closed");
	});
});
