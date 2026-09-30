import { loadQualifiedPackage } from "../../../../integrations/langflow/release";
import type { Config } from "../config";
import type { ServiceTransport } from "../db/transport";
import { type JobsLog, scaledClock } from "../jobs";
import { createOciDriver, importVerifiedOciImage, LangflowHostControl, LangflowSupervisor } from "../langflowHost";
import { startLangflowLifecycle } from "../langflowLifecycle";
import { langflowLifecycleTransport } from "../langflowLifecycle/transport";
import { installedEditorManifest } from "../services/flowDocuments";
import { actionControl } from "../services/langflowDispatch/actionControl";
import { authorityTransport } from "./authorityTransport";
import { composeLangflowBootstrap } from "./compose";
import { readLangflowBootstrapConfiguration } from "./configuration";
import { createLangflowConnections } from "./connections";
import { readEngineConfiguration } from "./engineConfiguration";
import { groupDeadlines } from "./groupDeadlines";
import { nativeReservations } from "./nativeReservations";
import { pairedBackup } from "./pairedBackup";

export async function startLangflowBootstrap(config: Config, transport: ServiceTransport, log: JobsLog) {
	const composed = await composeLangflowBootstrap(config, {
		readConfiguration: readLangflowBootstrapConfiguration,
		readIdentity: LangflowHostControl.readIdentity,
		qualify: (configuration, identity) =>
			loadQualifiedPackage({
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
		clock: scaledClock(config.clockRate),
		log,
		connect: (signal) =>
			createLangflowConnections({
				home: config.home,
				configured: composed.configured,
				live: composed.live,
				transport,
				supervisor: composed.supervisor,
				signal,
				log,
			}),
	});
	const liveTransport = langflowLifecycleTransport(transport, lifecycle);
	const native = nativeReservations({
		home: config.home,
		transport: liveTransport,
		supervisor: composed.supervisor,
		archive: actionControl(config.home).archive,
	});
	const deadlines = groupDeadlines({ home: config.home, transport: liveTransport, supervisor: composed.supervisor });
	const backup = pairedBackup({ home: config.home, transport, supervisor: composed.supervisor });
	return {
		...composed,
		lifecycle,
		transport: liveTransport,
		nativeReservations: native.transport,
		groupDeadlines: deadlines.handle,
		backup: backup.backup,
		stopBackup: backup.stop,
		stop: async () => {
			await backup.stop();
			await lifecycle.stop();
			await Promise.all([native.stop(), deadlines.stop()]);
			await composed.stop();
		},
	};
}
