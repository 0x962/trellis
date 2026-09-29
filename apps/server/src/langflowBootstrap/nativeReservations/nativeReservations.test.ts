import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import type { ServiceTransport } from "../../db/transport";
import handle from "../../langflowContracts/fixtures/native-handle.json";
import request from "../../langflowContracts/fixtures/native-request.json";
import { supervisorFixture } from "../../langflowHost/fixtures/supervisorFixture";
import { PrivateState } from "../../langflowHost/privateState";
import { nativeReservations } from "./nativeReservations";

test("equal reservation replay needs no engine journal read and shutdown awaits the held callback", async () => {
	const f = await supervisorFixture();
	const supervisor = await f.open();
	let connection: ReturnType<typeof nativeReservations> | undefined;
	try {
		const live = await supervisor.start();
		const state = await PrivateState.open(f.home);
		const credential = await state.nativeReservationAuthentication(live.identity);
		const authorization = `Bearer ${await readFile(credential.nativeReservationAuthenticationFile, "utf8")}`;
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const calls: string[] = [];
		const requestBytes = `${JSON.stringify(request, null, 2)}\n`;
		const transport: ServiceTransport = {
			start: async () => {
				throw new Error("Unexpected start");
			},
			close: async () => {},
			call: async (name, context, input) => {
				calls.push(name);
				expect(name).toBe("langflowNative.reservationState");
				expect(context.actor?.kind).toBe("system");
				expect(input).toMatchObject({
					requestBytes,
					capabilityId: "capability",
					observation: { identity: live.identity },
				});
				entered.resolve();
				await release.promise;
				return { authority: f.authority(), request: { state: "reserved", handle } };
			},
		};
		connection = nativeReservations({
			home: f.home,
			transport,
			supervisor,
			archive: {
				readAuthorityBytes: () => {
					throw new Error("Replay must not read engine authority");
				},
			},
		});
		await expect(
			connection.transport.reserve({
				authorization: "Bearer wrong",
				capabilityId: "capability",
				requestBytes,
			}),
		).rejects.toThrow("authentication_denied");
		expect(calls).toEqual([]);
		const pending = connection.transport.reserve({ authorization, capabilityId: "capability", requestBytes });
		await entered.promise;
		let stopped = false;
		const stopping = connection.stop().then(() => {
			stopped = true;
		});
		await Promise.resolve();
		expect(stopped).toBe(false);
		release.resolve();
		expect(await pending).toBe(JSON.stringify(handle));
		await stopping;
		expect(calls).toEqual(["langflowNative.reservationState"]);
		await expect(
			connection.transport.reserve({ authorization, capabilityId: "capability", requestBytes }),
		).rejects.toThrow("langflow_runtime_stopping");
	} finally {
		await connection?.stop();
		await supervisor.shutdown();
		await f.remove();
	}
});
