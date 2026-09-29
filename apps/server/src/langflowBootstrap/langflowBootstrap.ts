import { loadQualifiedPackage } from "../../../../integrations/langflow/release";
import type { Config } from "../config";
import type { ServiceTransport } from "../db/transport";
import { createOciDriver, importVerifiedOciImage, LangflowHostControl, LangflowSupervisor } from "../langflowHost";
import { installedEditorManifest } from "../services/flowDocuments";
import { actionControl } from "../services/langflowDispatch/actionControl";
import { authorityTransport } from "./authorityTransport";
import { composeLangflowBootstrap } from "./compose";
import { readLangflowBootstrapConfiguration } from "./configuration";
import { readEngineConfiguration } from "./engineConfiguration";
import { nativeReservations } from "./nativeReservations";

export async function startLangflowBootstrap(config: Config, transport: ServiceTransport) {
	const composed = await composeLangflowBootstrap(config, {
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
	if (composed === undefined) return undefined;
	const native = nativeReservations({
		home: config.home,
		transport,
		supervisor: composed.supervisor,
		archive: actionControl(config.home).archive,
	});
	return {
		...composed,
		nativeReservations: native.transport,
		stop: async () => {
			await native.stop();
			await composed.stop();
		},
	};
}
