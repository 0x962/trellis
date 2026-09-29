import type { FlowDocumentSnapshotV1 } from "@trellis/api";
import type { ConcreteConversionProducer } from "../../langflowMigration";
import type { DocumentPublisher } from "../publisher";

export type CapturedDocument = {
	snapshot: FlowDocumentSnapshotV1;
	sourceBytes: Buffer;
};

export type DocumentActionServices = {
	publisher: () => Promise<DocumentPublisher>;
	conversion: (
		base: FlowDocumentSnapshotV1,
		publisher: DocumentPublisher,
		savedAt: Date,
	) => Promise<ConcreteConversionProducer | null>;
	installedIdentity: () => {
		enginePackageDigest: string;
		componentManifestHash: string;
	};
};
