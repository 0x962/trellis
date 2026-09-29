import { loadQualifiedPackage } from "../../../../integrations/langflow/release";
import { scaledClock, type JobsLog } from "../jobs";
import { startLangflowLifecycle } from "../langflowLifecycle";
import { langflowLifecycleTransport } from "../langflowLifecycle/transport";
import { createLangflowConnections } from "./connections";
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

export async function startLangflowBootstrap(config: Config, transport: ServiceTransport, log: JobsLog) {
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
	const lifecycle = await startLangflowLifecycle({
		clock: scaledClock(config.clockRate), log,
		connect: (signal) => createLangflowConnections({
			home: config.home, configured: composed.configured, live: composed.live,
			transport, supervisor: composed.supervisor, signal, log,
		}),
	});
	const liveTransport = langflowLifecycleTransport(transport, lifecycle);
	const native = nativeReservations({
		home: config.home,
		transport: liveTransport,
		supervisor: composed.supervisor,
		archive: actionControl(config.home).archive,
	});
	return {
		...composed,
		lifecycle,
		transport: liveTransport,
		nativeReservations: native.transport,
		stop: async () => {
			await lifecycle.stop();
			await native.stop();
			await composed.stop();
		},
	};
}
