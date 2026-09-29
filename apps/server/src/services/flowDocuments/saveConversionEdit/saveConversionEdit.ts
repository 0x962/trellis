import { requireActor } from "../../../context";
import { invalidInput } from "../../../errors";
import { ConversionEditIntentV1Schema, type prepareConversionEdit } from "../../langflowMigration";
import type { IoCtx } from "../../support";
import { documentBytes } from "../documentBytes";
import { commitEdit } from "./components/commitEdit/commitEdit";
import { readEditBase } from "./components/readEditBase/readEditBase";

export type ConversionEditServices = {
	prepare: (input: Parameters<typeof prepareConversionEdit>[0]) => ReturnType<typeof prepareConversionEdit>;
	installedIdentity: () => { enginePackageDigest: string; componentManifestHash: string };
};

export async function saveConversionEdit(ctx: IoCtx, value: unknown, services: ConversionEditServices) {
	requireActor(ctx.core);
	const intent = ConversionEditIntentV1Schema.parse(value);
	const intentBytes = documentBytes(intent);
	const captured = await ctx.newTx((tx) => readEditBase(ctx.core, tx, { intent, intentBytes }));
	if (captured.state === "replayed") return { requestId: intent.requestId, document: captured.document };
	const checkInstalled = () => {
		const installed = services.installedIdentity();
		if (
			installed.enginePackageDigest !== intent.enginePackageDigest ||
			installed.componentManifestHash !== intent.componentManifestHash
		)
			throw invalidInput("enginePackageDigest", "The installed package no longer matches this edit.");
	};
	checkInstalled();
	const prepared = await services.prepare({
		base: captured.base.snapshot,
		requestBytes: intentBytes,
	});
	if (prepared.state === "blocked") {
		const current = await ctx.newTx((tx) => readEditBase(ctx.core, tx, { intent, intentBytes }));
		return current.state === "replayed" ? { requestId: intent.requestId, document: current.document } : prepared;
	}
	const document = await ctx.newTx((tx) =>
		commitEdit(ctx.core, tx, { intent, intentBytes, base: captured.base, prepared }, checkInstalled),
	);
	return { requestId: intent.requestId, document };
}
