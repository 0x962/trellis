import { createHash } from "node:crypto";
import { join } from "node:path";
import { LangflowHostControl } from "../../langflowHost";
import { ReceiptObjectStore } from "../../langflowHost/objectStore";
import type { TrustedConversionProducerInput } from "../../services/langflowMigration";
import type { LangflowBootstrapConfiguration } from "../configuration";
import { readPrivateConfiguration } from "../privateConfiguration";

export async function retainNativePolicy(
	home: string,
	configuration: LangflowBootstrapConfiguration["nativePolicy"],
): Promise<TrustedConversionProducerInput["configuration"]> {
	if (configuration === undefined) return null;
	const bytes = await readPrivateConfiguration(configuration.path);
	if (createHash("sha256").update(bytes).digest("hex") !== configuration.sha256)
		throw new Error("native_policy_configuration_digest_conflict");
	const identity = LangflowHostControl.readIdentity(home);
	const objects = new ReceiptObjectStore(join(LangflowHostControl.directory(home), "native-policy-configurations"));
	const receiptId = objects.write(
		JSON.stringify({
			version: 1,
			identity,
			path: configuration.path,
			sha256: configuration.sha256,
			bytesBase64: bytes.toString("base64"),
		}),
	);
	objects.bind(JSON.stringify([configuration.path, configuration.sha256]), receiptId);
	return { bytes, sha256: configuration.sha256 };
}
