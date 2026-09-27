import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type BootstrapMetadata = {
	schemaVersion: 1;
	installationId: string;
	dataHome: string;
	forwardedPort: number;
	containerPort: 4521;
	authTokenFile: string;
	releaseId: string;
};

export type ContainerPaths = {
	dataHome: string;
	container: string;
	home: string;
	runtime: string;
	bootstrap: string;
	authToken: string;
	state: string;
	replacementReady: string;
};

export const containerPaths = (dataHome: string): ContainerPaths => {
	const container = join(dataHome, "container");
	return {
		dataHome,
		container,
		home: join(dataHome, "home"),
		runtime: join(dataHome, "runtime"),
		bootstrap: join(container, "bootstrap.json"),
		authToken: join(container, "auth-token"),
		state: join(container, "state.json"),
		replacementReady: join(container, "replacement-ready.json"),
	};
};

const writePrivate = async (path: string, value: string) => {
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, value, { mode: 0o600 });
	await rename(temporary, path);
	await chmod(path, 0o600);
};

export const writePrivateJson = async (path: string, value: unknown) =>
	writePrivate(path, `${JSON.stringify(value, null, 2)}\n`);

const readMetadata = async (path: string): Promise<BootstrapMetadata | null> => {
	if (!(await Bun.file(path).exists())) return null;
	return JSON.parse(await readFile(path, "utf8")) as BootstrapMetadata;
};

export const prepareContainerState = async (
	dataHome: string,
	forwardedPort: number,
	releaseId: string,
): Promise<{ paths: ContainerPaths; metadata: BootstrapMetadata; authToken: string }> => {
	const paths = containerPaths(dataHome);
	for (const path of [paths.dataHome, paths.container, paths.home, paths.runtime]) {
		await mkdir(path, { recursive: true, mode: 0o700 });
		await chmod(path, 0o700);
	}
	const prior = await readMetadata(paths.bootstrap);
	const metadata: BootstrapMetadata = {
		schemaVersion: 1,
		installationId: prior?.installationId ?? randomUUID(),
		dataHome,
		forwardedPort,
		containerPort: 4521,
		authTokenFile: paths.authToken,
		releaseId,
	};
	const authToken = (await Bun.file(paths.authToken).exists())
		? (await readFile(paths.authToken, "utf8")).trim()
		: randomBytes(32).toString("hex");
	await writePrivate(paths.authToken, `${authToken}\n`);
	await writePrivateJson(paths.bootstrap, metadata);
	await rm(paths.replacementReady, { force: true });
	return { paths, metadata, authToken };
};
