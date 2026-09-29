import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { editorFixture } from "./fixture";

describe("parent document save hook", () => {
	let fixture: Awaited<ReturnType<typeof editorFixture>>;
	beforeAll(async () => {
		fixture = await editorFixture();
	});
	afterAll(async () => {
		await fixture.db.$client.close();
	});

	test("retains one committed receipt and permits the next queue request", async () => {
		const f = await fixture.setup();
		const input = f.input();
		const first = await f.parentSave(input);
		expect(await f.parentSave(input)).toEqual(first);
		expect(f.writes()).toBe(1);
		const next = await f.parentSave(f.input(first.revision));
		expect(next.revision).toBe(first.revision + 1);
		expect(f.writes()).toBe(2);
		expect((await (await f.request("session")).json()).identity).toEqual(f.session.identity);
	});

	test("does not invoke a save for another actor, channel, flow, or manifest", async () => {
		const f = await fixture.setup();
		let calls = 0;
		const save = async () => {
			calls += 1;
			return f.current.document;
		};
		for (const request of [
			{ channel: "unknown", actor: fixture.ctx.actor!, input: f.input() },
			{ channel: f.session.channel, actor: { kind: "human" as const, name: "other" }, input: f.input() },
			{ channel: f.session.channel, actor: fixture.ctx.actor!, input: { ...f.input(), flow: "other-flow" } },
			{
				channel: f.session.channel,
				actor: fixture.ctx.actor!,
				input: { ...f.input(), componentManifestHash: "e".repeat(64) },
			},
		]) {
			await expect(f.server.withDocumentSave(request, save)).rejects.toBeDefined();
		}
		expect(calls).toBe(0);
	});

	test("does not advance authority after an uncommitted failure", async () => {
		const f = await fixture.setup();
		const input = f.input();
		await expect(
			f.server.withDocumentSave({ channel: f.session.channel, actor: fixture.ctx.actor!, input }, async () => {
				throw new Error("uncommitted");
			}),
		).rejects.toThrow("uncommitted");
		expect((await f.request("document")).status).toBe(409);
		expect((await f.parentSave(input)).revision).toBe(input.expectedVersion + 1);
	});

	test("recovers a committed receipt after the transport fails before its response", async () => {
		const f = await fixture.setup();
		const input = f.input();
		let callbacks = 0;
		const request = { channel: f.session.channel, actor: fixture.ctx.actor!, input };
		await expect(
			f.server.withDocumentSave(request, async () => {
				callbacks += 1;
				await f.options.documents.save(fixture.ctx.actor!, { document: input, projectId: f.current.projectId });
				throw new Error("response lost after commit");
			}),
		).rejects.toThrow("response lost after commit");
		await expect(f.parentSave(f.input())).rejects.toMatchObject({ code: "EDITOR_SAVE_IN_PROGRESS" });
		const receipt = await f.server.withDocumentSave(request, async () => {
			callbacks += 1;
			throw new Error("The durable receipt must resolve this request.");
		});
		expect(receipt.revision).toBe(input.expectedVersion + 1);
		expect(callbacks).toBe(1);
		expect(f.writes()).toBe(1);
		expect((await f.parentSave(f.input(receipt.revision))).revision).toBe(receipt.revision + 1);
	});

	test("returns an accepted receipt after another grant saves a later revision", async () => {
		const f = await fixture.setup();
		const input = f.input();
		const receipt = await f.parentSave(input);
		await f.options.documents.save(fixture.ctx.actor!, {
			document: f.input(receipt.revision),
			projectId: f.current.projectId,
		});
		expect(await f.parentSave(input)).toEqual(receipt);
		await expect(f.parentSave(f.input(receipt.revision))).rejects.toMatchObject({ code: "FLOW_VERSION_CONFLICT" });
	});

	test("holds channel exclusion until the callback returns its committed receipt", async () => {
		const f = await fixture.setup();
		const input = f.input();
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const first = f.server.withDocumentSave(
			{ channel: f.session.channel, actor: fixture.ctx.actor!, input },
			async () => {
				entered.resolve();
				await release.promise;
				return f.options.documents.save(fixture.ctx.actor!, { document: input, projectId: f.current.projectId });
			},
		);
		await entered.promise;
		await expect(f.parentSave(f.input())).rejects.toMatchObject({ code: "EDITOR_SAVE_IN_PROGRESS" });
		expect((await f.request("document")).status).toBe(409);
		release.resolve();
		expect((await first).revision).toBe(input.expectedVersion + 1);
		expect((await f.request("document")).status).toBe(200);
		expect(f.writes()).toBe(1);
	});

	test("checks revoked and expired grants before the cached parent receipt", async () => {
		for (const end of ["revoke", "expire"] as const) {
			const f = await fixture.setup();
			const input = f.input();
			await f.parentSave(input);
			if (end === "revoke") await f.request("grant", "DELETE");
			else f.setTime("2026-09-29T09:00:00Z");
			await expect(f.parentSave(input)).rejects.toMatchObject({ status: 403 });
			expect(f.writes()).toBe(1);
		}
	});
});
