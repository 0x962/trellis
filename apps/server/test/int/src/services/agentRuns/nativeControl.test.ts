import { afterEach, expect, test } from "bun:test";
import { readNativeWork, setNativeWork } from "../../../../../src/services/agentRuns/nativeControl.ts";
import { createTestApp, type TestApp } from "../../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let t: TestApp;
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("a durable local stop prevents new agent reservations until a person resumes", async () => {
	t = await createTestApp();
	await t.seedProject("PAU");
	await t.client.projects.update({
		project: "PAU",
		managerConfig: { personaId: null, concurrency: 3, directory: "/tmp", ade: "native" },
	});
	const ticket = await t.createTicket({ project: "PAU", title: "Paused work" });
	const persona = await t.client.personas.create({ name: "Paused fixture", kind: "builder", instruction: "Wait." });
	await t.db.transaction((tx) =>
		setNativeWork({ actor: { kind: "human", name: "fixture" }, now: new Date() }, tx, { paused: true }),
	);
	await expect(t.client.agentRuns.start({ ticket: ticket.identifier, personaId: persona.id })).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
	expect(await t.client.agentRuns.list({ ticket: ticket.identifier })).toEqual([]);
	await expect(
		t.db.transaction((tx) =>
			setNativeWork({ actor: { kind: "agent", name: "fixture" }, now: new Date() }, tx, { paused: false }),
		),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await t.db.transaction((tx) =>
		setNativeWork({ actor: { kind: "human", name: "fixture" }, now: new Date() }, tx, { paused: false }),
	);
	expect(await t.db.transaction((tx) => readNativeWork(tx))).toEqual({ paused: false });
});
