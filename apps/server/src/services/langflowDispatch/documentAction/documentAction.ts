import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { CandidatePackage } from "../../../../../../integrations/langflow/release";
import { LangflowHostControl, type LiveOwnership } from "../../../langflowHost";
import {
	activateConversion,
	createConversionValidator,
	type DocumentActionReceiptInput,
	type DocumentActionServices,
	installedPublisher,
	publicationDispatch,
	publishSavedDocument,
	saveConversionEdit,
} from "../../flowDocuments";
import { createConversionProducer, prepareConversionEdit } from "../../langflowMigration";
import type { IoCtx } from "../../support";
import { actionControl } from "../actionControl";

export type DocumentActionInput = DocumentActionReceiptInput & {
	package: CandidatePackage;
	engineCommit: string;
	observation: LiveOwnership;
	authenticationFile: string;
};

async function readSealedBytes(path: string, digest: string) {
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		if (!(await file.stat()).isFile()) throw new Error("document_action_package_file_invalid");
		const bytes = await file.readFile();
		if (createHash("sha256").update(bytes).digest("hex") !== digest)
			throw new Error("document_action_package_file_changed");
		return bytes;
	} finally {
		await file.close();
	}
}

export async function documentAction(ctx: IoCtx, input: DocumentActionInput) {
	const identity = input.package;
	const services: DocumentActionServices = {
		installedIdentity: () => {
			const current = LangflowHostControl.readIdentity(ctx.home);
			if (
				current.hostId !== input.observation.identity.hostId ||
				current.dataHomeId !== input.observation.identity.dataHomeId ||
				input.observation.identity.manifestDigest !== identity.enginePackageDigest
			)
				throw new Error("document_action_host_conflict");
			return identity;
		},
		publisher: async () => {
			services.installedIdentity();
			const control = actionControl(ctx.home);
			return installedPublisher({
				package: identity,
				ownership: input.observation,
				authenticationFile: input.authenticationFile,
				dispatch: publicationDispatch(control.gate, control.archive),
			});
		},
		conversion: async (base, publisher, savedAt) => {
			const templates = identity.frontendTemplates;
			if (templates !== null && templates.engineOverlayHash !== identity.engineOverlayHash)
				throw new Error("document_action_overlay_conflict");
			return createConversionProducer(
				{
					catalogBytes: await readSealedBytes(identity.componentManifestPath, identity.componentManifestHash),
					frontendTemplateBytes: templates === null ? null : await readSealedBytes(templates.path, templates.sha256),
					componentManifestHash: identity.componentManifestHash,
					enginePackageDigest: identity.enginePackageDigest,
					engineCommit: input.engineCommit,
					engineOverlayHash: identity.engineOverlayHash,
					nativePolicies: {},
				},
				createConversionValidator(base, publisher, savedAt),
			);
		},
	};
	if (input.operation === "publish") return publishSavedDocument(ctx, input.value, services);
	if (input.operation === "convert") return activateConversion(ctx, input.value, services);
	return saveConversionEdit(ctx, input.value, {
		installedIdentity: services.installedIdentity,
		prepare: async (request) => {
			const publisher = await services.publisher();
			const producer = await services.conversion(request.base, publisher, ctx.core.now);
			return prepareConversionEdit(request, producer);
		},
	});
}
