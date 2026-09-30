import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { qualificationFixture } from "../../../../../../../integrations/langflow/release/loadQualifiedPackage/components/qualificationFixture/qualificationFixture";
import { loadQualifiedPackage } from "../../../../../../../integrations/langflow/release";
import { lockHome } from "../../../../homeLock";
import { protocolDigest } from "../../../../langflowContracts";
import { manifestName, snapshotRoots } from "../../../../services/langflowBackup/manifest";
import { PairedJournal } from "../../../../services/langflowBackup/pairedJournal";
import { sealSnapshot } from "../../../../services/langflowBackup/sealSnapshot";
import { LangflowHostControl } from "../../../hostControl";
import type { OciRun } from "../../../ociDriver/process/process";
import type { VolumeInspection } from "../../../ociDriver/storage/storage";
import { installRestoredEngine } from "../../../restoredEngine";
import { engineRestoreScript } from "../../../restoredEngine/components/helper";

export async function restoredStartupFixture() {
	const packageFixture = await qualificationFixture();
	const root = await realpath(packageFixture.root);
	const home = join(root, "target");
	const directory = join(root, "envelope");
	const payload = join(directory, "payload");
	await mkdir(home, { mode: 0o700 });
	await mkdir(payload, { recursive: true, mode: 0o700 });
	for (const name of snapshotRoots) await mkdir(join(payload, name), { mode: 0o700 });
	const database = join(payload, "engine/database.sqlite");
	const create = Bun.spawn(["python3", "-c", 'import sqlite3,os,sys; c=sqlite3.connect(sys.argv[1]); c.execute("CREATE TABLE alembic_version(version_num TEXT)"); c.execute("INSERT INTO alembic_version VALUES (\'fixture-head\')"); c.commit(); c.close(); os.chmod(sys.argv[1],0o600)', database], { stdout: "pipe", stderr: "pipe" });
	const [code, error] = await Promise.all([create.exited, new Response(create.stderr).text()]);
	if (code !== 0) throw new Error(error);
	const secretBytes = "fixture-captured-secret";
	await writeFile(join(payload, "secrets/engine-secret"), secretBytes, { mode: 0o600 });
	const databaseBytes = await readFile(database);
	const compatibility = { trellisRelease: "fixture", enginePackageDigest: packageFixture.options.packageId,
		trellisDatabaseVersion: "fixture", engineDatabaseVersion: "fixture-head", secretVersion: protocolDigest(secretBytes) };
	const binding = { snapshotId: crypto.randomUUID(), sourceDataHomeId: crypto.randomUUID(), sourceHostId: crypto.randomUUID(),
		boundaryReceiptId: "fixture-boundary", compatibility };
	await writeFile(join(payload, "engine/receipt.json"), JSON.stringify({ version: 1, binding,
		database: { sha256: new Bun.CryptoHasher("sha256").update(databaseBytes).digest("hex"), size: databaseBytes.length },
		secret: { sha256: protocolDigest(secretBytes), size: Buffer.byteLength(secretBytes) },
		revisions: ["fixture-head"], tables: ["alembic_version"] }), { mode: 0o600 });
	await sealSnapshot({ directory: payload, metadata: { snapshotId: binding.snapshotId,
		sourceDataHomeId: binding.sourceDataHomeId, sourceHostId: binding.sourceHostId,
		createdAt: "2026-09-29T00:00:00.000Z", compatibility, boundary: { kind: "quiesced-export", receiptId: binding.boundaryReceiptId }, unavailable: [] } });
	const manifestDigest = protocolDigest(await readFile(join(payload, manifestName), "utf8"));
	const control = LangflowHostControl.initialize({ home, initialBlock: { requestId: crypto.randomUUID(),
		reason: { kind: "restore", directory, snapshotId: binding.snapshotId, sourceDataHomeId: binding.sourceDataHomeId, manifestDigest } } });
	if (!control.block) throw new Error("fixture_block_missing");
	const journal = await PairedJournal.create(control, { version: 1, kind: "restore", snapshotId: binding.snapshotId,
		requestId: control.block.requestId, directory, dataHomeId: control.identity.dataHomeId, hostId: control.identity.hostId,
		compatibility, createdAt: "2026-09-29T00:00:00.000Z" });
	await journal.write("block", control.block);
	await journal.write("restored", { payload, manifestDigest, targetHome: home });
	const qualification = packageFixture.options;
	qualification.dataHomeId = control.identity.dataHomeId;
	qualification.runtime.data.dataHomeId = control.identity.dataHomeId;
	qualification.runtime.epochOwnership.dataHomeId = control.identity.dataHomeId;
	const qualified = await loadQualifiedPackage(qualification);
	const volumes = new Map<string, VolumeInspection>();
	const commands: string[][] = [];
	const volumePaths = { data: join(root, "volume-data"), secrets: join(root, "volume-secrets") };
	const run: OciRun = async (args) => {
		commands.push(args);
		const result = (value: unknown) => ({ exitCode: 0, stdout: JSON.stringify(value), stderr: "" });
		if (args[0] === "image") return result([{ Id: qualified.candidate.engine.imageConfigDigest, Os: "linux", Architecture: qualified.manifest.target.architecture === "arm64" ? "arm64" : "amd64",
			Config: { Env: ["LANGFLOW_DATABASE_URL=sqlite:////data/config/langflow.db"] } }]);
		if (args[0] === "container" && args[1] === "ls") return { exitCode: 0, stdout: "", stderr: "" };
		if (args[0] === "volume" && args[1] === "inspect") {
			const volume = volumes.get(args[2]!);
			return volume ? result([volume]) : { exitCode: 1, stdout: "", stderr: "No such volume" };
		}
		if (args[0] === "volume" && args[1] === "create") {
			const name = args.at(-1)!;
			const labels: Record<string, string> = {};
			for (let i = 0; i < args.length; i += 1) if (args[i] === "--label") {
				const value = args[i + 1]!; const separator = value.indexOf("=");
				labels[value.slice(0, separator)] = value.slice(separator + 1);
			}
			if (!volumes.has(name)) {
				await mkdir(name.includes("-data-") ? volumePaths.data : volumePaths.secrets, { mode: 0o700 });
				volumes.set(name, { Name: name, Driver: "local", Labels: labels });
			}
			return result(name);
		}
		if (args[0] === "container" && args[1] === "run" && args.includes(engineRestoreScript)) {
			const paths: Record<string, string> = {};
			for (let i = 0; i < args.length; i += 1) if (args[i] === "--mount") {
				const mount = Object.fromEntries(args[i + 1]!.split(",").map((field) => field.split("=")));
				if (mount.type === "bind") paths[mount.dst!] = mount.src!;
			}
			const body = `__name__ = "fixture"\n${engineRestoreScript}\n` +
				'result=restore(sys.argv[1],Path(sys.argv[2]),Path(sys.argv[3]),Path(sys.argv[4]),Path(sys.argv[5]),Path(sys.argv[6]),os.getuid(),os.getgid())\n' +
				'result["database"].update(uid=10001,gid=10001)\nresult["secret"].update(uid=10001,gid=10001)\nprint(json.dumps(result))';
			const child = Bun.spawn(["python3", "-", args.at(-1)!, paths["/input/intent"]!, volumePaths.data, volumePaths.secrets,
				paths["/input/database"]!, paths["/input/secret"]!], { stdin: new Blob([body]), stdout: "pipe", stderr: "pipe" });
			const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
			return { exitCode, stdout, stderr };
		}
		throw new Error("fixture_unsupported_oci_command");
	};
	const signal = new AbortController().signal;
	const input = { home, hostId: control.identity.hostId, dataHomeId: control.identity.dataHomeId, block: control.block, qualification };
	const installed = await installRestoredEngine(input, { executable: "fixture-oci", signal, run });
	const homeLock = lockHome(home, "server", null);
	return { root, home, control, qualification, qualified, run, commands, volumes, volumePaths, installed, input, signal, homeLock,
		async remove() { homeLock.release(); await rm(root, { recursive: true, force: true }); } };
}
