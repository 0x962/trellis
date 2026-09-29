import { ActivateConversionV1InputSchema, type FlowDocumentActionResultV1 } from "@trellis/api";
import { requireActor } from "../../../context";
import { invalidInput } from "../../../errors";
import type { IoCtx } from "../../support";
import type { DocumentActionServices } from "../documentActionServices";
import { documentBytes } from "../documentBytes";
import { prepareDocumentConversion } from "../prepareDocumentConversion";
import { captureConversion } from "./components/captureConversion/captureConversion";
import { commitConversion } from "./components/commitConversion/commitConversion";

export const activateConversion = async (
	ctx: IoCtx,
	value: unknown,
	services: DocumentActionServices,
): Promise<FlowDocumentActionResultV1> => {
	requireActor(ctx.core);
	const input = ActivateConversionV1InputSchema.parse(value);
	const requestBytes = documentBytes(input);
	const captured = await ctx.newTx((tx) => captureConversion(ctx.core, tx, input, requestBytes));
	if (captured.state === "replayed") return { requestId: input.requestId, document: captured.document };
	const checkInstalled = () => {
		const identity = services.installedIdentity();
		if (
			identity.enginePackageDigest !== input.enginePackageDigest ||
			identity.componentManifestHash !== input.componentManifestHash
		)
			throw invalidInput("enginePackageDigest", "The installed package no longer matches the conversion request.");
	};
	checkInstalled();
	const publisher = await services.publisher();
	if (
		publisher.enginePackageDigest !== input.enginePackageDigest ||
		publisher.componentManifestHash !== input.componentManifestHash
	)
		throw invalidInput("enginePackageDigest", "The publisher does not match the conversion request.");
	const producer = await services.conversion(captured.base.snapshot, publisher, ctx.core.now);
	const prepared = await prepareDocumentConversion(captured.base, publisher, producer, ctx.core.now);
	if (prepared.state === "blocked") {
		const current = await ctx.newTx((tx) => captureConversion(ctx.core, tx, input, requestBytes));
		return current.state === "replayed" ? { requestId: input.requestId, document: current.document } : prepared;
	}
	const document = await ctx.newTx((tx) =>
		commitConversion(ctx.core, tx, input, requestBytes, prepared, checkInstalled),
	);
	return { requestId: input.requestId, document };
};
