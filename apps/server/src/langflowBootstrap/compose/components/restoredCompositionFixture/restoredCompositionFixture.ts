import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadQualifiedPackage } from "../../../../../../../integrations/langflow/release";
import { protocolDigest } from "../../../../langflowContracts";
import {
	createOciDriver,
	LangflowHostControl,
	LangflowSupervisor,
	readRestoredEngineStartup,
} from "../../../../langflowHost";
import { restoredStartupFixture } from "../../../../langflowHost/restoredStartup/fixtures/restoredStartupFixture";
import { bootstrapFixture } from "../../../fixtures";

export async function restoredCompositionFixture() {
	const installed = await restoredStartupFixture();
	const f = bootstrapFixture();
	Object.assign(f.identity, installed.control.identity);
	f.config.home = installed.home;
	Object.assign(f.configuration, {
		packageRoot: installed.qualification.packageRoot,
		packageId: installed.qualification.packageId,
		qualificationFile: installed.qualification.qualificationFile,
		qualificationSha256: installed.qualification.qualificationSha256,
		runtime: installed.qualification.runtime,
		expectedHostId: f.identity.hostId,
		expectedDataHomeId: f.identity.dataHomeId,
		restoredEngineReceiptId: installed.installed.receiptId,
		engineApiConfigFile: join(installed.home, "engine-api.json"),
		captureIssuerFile: join(installed.home, "capture-issuer.key"),
	});
	const engineBytes = "{}\n";
	await writeFile(f.configuration.engineApiConfigFile, engineBytes, { mode: 0o600 });
	await writeFile(f.configuration.captureIssuerFile, "fixture-issuer", { mode: 0o600 });
	f.dependencies.readIdentity = LangflowHostControl.readIdentity;
	f.dependencies.qualify = loadQualifiedPackage;
	f.dependencies.restoredStartup = (input) =>
		readRestoredEngineStartup({ ...input, homeLock: installed.homeLock, signal: installed.signal });
	f.dependencies.engineConfiguration = async () => ({ sha256: protocolDigest(engineBytes) });
	f.dependencies.importImage = async () => ({
		imageConfigDigest: installed.qualified.candidate.engine.imageConfigDigest,
	});
	f.dependencies.driver = (options) => createOciDriver({ ...options, dependencies: { run: installed.run } });
	let supervisor: LangflowSupervisor | undefined;
	f.dependencies.openSupervisor = async (input) => {
		supervisor = await LangflowSupervisor.open(input);
		return supervisor;
	};
	return {
		...f,
		installed,
		async remove() {
			await supervisor?.shutdown();
			await installed.remove();
		},
	};
}
