import type { PublishDocumentV1Input } from "@trellis/api";
import type { DocumentActionServices } from "../documentActionServices";
import { flowId, manifestHash, packageDigest, publisher, serviceFixture } from "../fixture";
import { get } from "../get";

export const publicationFixture = async () => {
	const fixture = await serviceFixture("langflow");
	const document = await fixture.run((tx) => get(fixture.ctx, tx, { flow: flowId }));
	const input: PublishDocumentV1Input = {
		flowId, expectedVersion: document.revision, expectedDocumentHash: document.documentHash,
		componentManifestHash: manifestHash, enginePackageDigest: packageDigest, requestId: crypto.randomUUID(),
	};
	const engine = publisher();
	const services: DocumentActionServices = {
		publisher: async () => engine,
		conversion: async () => null,
		installedIdentity: () => ({ enginePackageDigest: packageDigest, componentManifestHash: manifestHash }),
	};
	return { ...fixture, input, document, engine, services };
};
