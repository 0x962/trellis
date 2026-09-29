import { loadQualifiedPackage } from "../../../../integrations/langflow/release";
import type { Config } from "../config";
import type { ServiceTransport } from "../db/transport";
import { createOciDriver, importVerifiedOciImage, LangflowHostControl, LangflowSupervisor } from "../langflowHost";
import { installedEditorManifest } from "../services/flowDocuments";
import { authorityTransport } from "./authorityTransport";
import { composeLangflowBootstrap } from "./compose";
import { readLangflowBootstrapConfiguration } from "./configuration";
import { readEngineConfiguration } from "./engineConfiguration";

export function startLangflowBootstrap(config: Config, transport: ServiceTransport) {
	return composeLangflowBootstrap(config, {
		readConfiguration: readLangflowBootstrapConfiguration,
		readIdentity: LangflowHostControl.readIdentity,
		qualify: (configuration, identity) => loadQualifiedPackage({
			packageRoot: configuration.packageRoot,
			packageId: configuration.packageId,
			qualificationFile: configuration.qualificationFile,
			qualificationSha256: configuration.qualificationSha256,
			dataHomeId: identity.dataHomeId,
			runtime: configuration.runtime,
		}),
		engineConfiguration: readEngineConfiguration,
		installedManifest: installedEditorManifest,
		importImage: importVerifiedOciImage,
		driver: createOciDriver,
		authority: (identity) => authorityTransport(transport, identity),
		openSupervisor: LangflowSupervisor.open,
	});
}
