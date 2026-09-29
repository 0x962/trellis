import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { fixture } from "../../../../../../integrations/langflow/tests/system/fixture";
import type { ServiceTransport } from "../../../db/transport";
import type { GhAccess } from "../../../ghState";
import { LangflowHostControl } from "../../../langflowHost";
import { router } from "../../../procedures";
import type { ProcedureContext } from "../../../procedures/base";
import { createDbTiming } from "../../../serverTiming";
import { services } from "../../registry";
import type { IoCtx } from "../../support";

export async function actionFixture() {
	const h = await fixture();
	const root = mkdtempSync(join(process.env.TMPDIR!, "trellis-flow-actions-"));
	const home = join(root, "home");
	mkdirSync(home);
	const control = LangflowHostControl.create({
		home,
		evidence: {
			readTerminal: async () => {
				throw new Error("Unexpected test terminal read");
			},
			withReconciliation: async (block, id, commit) =>
				commit({
					id,
					block,
					packageDigest: "a".repeat(64),
					trellisDatabaseReceiptId: "fixture-database",
					engineDatabaseReceiptId: "fixture-engine",
					secretReceiptId: "fixture-secret",
					ownershipReceiptId: "fixture-owner",
					nativeAttemptsReceiptId: "fixture-native",
					stopObligationsReceiptId: "fixture-stops",
					snapshotSealReceiptId: null,
				}),
		},
	});
	const io: IoCtx = {
		actor: { kind: "human", name: "fixture" },
		session: null,
		home,
		version: "fixture",
		apiVersion: "1",
		bootId: "fixture",
		now: () => h.ctx.now,
		ghStatus: () => ({ ok: true, user: "fixture", reason: null, message: null, checkedAt: null }),
		addresses: async () => [],
		log: () => {},
		emit: (event) => {
			h.events.push(event);
		},
		afterCommit: () => {
			throw new Error("Unexpected action afterCommit");
		},
		newTx: h.db.transaction.bind(h.db),
		vacuum: async () => {},
		core: h.ctx,
		localUrl: "http://localhost",
		publicUrl: "http://localhost",
		background: () => {
			throw new Error("Unexpected action background");
		},
	};
	const transport: ServiceTransport = {
		start: async () => {
			throw new Error("Unexpected test transport start");
		},
		close: async () => {},
		call: async (name, context, input) => {
			const entry = services[name];
			if (!("prepare" in entry)) throw new Error("Expected an action prepare service");
			const request = { ...io, core: { ...h.ctx, ...context, now: h.ctx.now } };
			const prepared = await entry.prepare(
				{
					...request,
					gh: Object.assign(
						async () => {
							throw new Error("Unexpected gh");
						},
						{ bin: "unused", timeoutMs: undefined },
					),
				},
				input,
			);
			return h.db.transaction((tx) => entry.run(request, tx, prepared));
		},
	};
	return {
		...h,
		home,
		io,
		control,
		open: () => control.gate.reconcile(control.gate.read().block!, "fixture-initialization"),
		close: async () => {
			await h.db.$client.close();
			rmSync(root, { recursive: true });
		},
		request: async (path: string, input: unknown) => {
			const raw = new Request(`http://localhost/api${path}`, {
				method: "POST",
				headers: { "content-type": "application/json", "x-trellis-actor": "human:fixture" },
				body: JSON.stringify(input),
			});
			const result = await new OpenAPIHandler<ProcedureContext>(router).handle(raw, {
				prefix: "/api",
				context: {
					headers: raw.headers,
					reqId: "action-http",
					transport,
					actor: null,
					timing: createDbTiming(),
					chooseDirectory: async () => null,
					gh: {} as GhAccess,
				},
			});
			if (!result.response) throw new Error("Action route was not mounted");
			return result.response;
		},
	};
}
