import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

type BootstrapMetadata = {
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

const readMetadata = async (path: string): Promise<BootstrapMetadata> => {
	const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
	if (
		value.schemaVersion !== 1 ||
		typeof value.installationId !== "string" ||
		!/^[0-9a-f-]{36}$/.test(value.installationId) ||
		typeof value.dataHome !== "string" ||
		typeof value.forwardedPort !== "number" ||
		!Number.isInteger(value.forwardedPort) ||
		value.forwardedPort < 1 ||
		value.forwardedPort > 65535 ||
		value.containerPort !== 4521 ||
		typeof value.authTokenFile !== "string" ||
		typeof value.releaseId !== "string" ||
		!/^[a-f0-9]{64}$/.test(value.releaseId)
	)
		throw new Error(`The bootstrap metadata is invalid at ${path}.`);
	return {
		schemaVersion: 1,
		installationId: value.installationId,
		dataHome: value.dataHome,
		forwardedPort: value.forwardedPort,
		containerPort: 4521,
		authTokenFile: value.authTokenFile,
		releaseId: value.releaseId,
	};
};

export const prepareContainerState = async (
	dataHome: string,
	forwardedPort: number,
	releaseId: string,
): Promise<{ paths: ContainerPaths; metadata: BootstrapMetadata; authToken: string }> => {
	const paths = containerPaths(dataHome);
	const hasBootstrap = await Bun.file(paths.bootstrap).exists();
	const hasAuthToken = await Bun.file(paths.authToken).exists();
	if (hasBootstrap !== hasAuthToken)
		throw new Error("The installation identity is incomplete. Restore both bootstrap.json and auth-token.");
	const prior = hasBootstrap ? await readMetadata(paths.bootstrap) : null;
	if (prior !== null && (prior.dataHome !== dataHome || prior.authTokenFile !== paths.authToken))
		throw new Error("The bootstrap metadata does not belong to this data home.");
	const authToken = hasAuthToken
		? (await readFile(paths.authToken, "utf8")).trim()
		: randomBytes(32).toString("hex");
	if (!/^[a-f0-9]{64}$/.test(authToken)) throw new Error(`The authentication token is invalid at ${paths.authToken}.`);
	for (const path of [paths.dataHome, paths.container, paths.home, paths.runtime]) {
		await mkdir(path, { recursive: true, mode: 0o700 });
		await chmod(path, 0o700);
	}
	const metadata: BootstrapMetadata = {
		schemaVersion: 1,
		installationId: prior === null ? randomUUID() : prior.installationId,
		dataHome,
		forwardedPort,
		containerPort: 4521,
		authTokenFile: paths.authToken,
		releaseId,
	};
	if (prior === null) await writePrivate(paths.authToken, `${authToken}\n`);
	await writePrivateJson(paths.bootstrap, metadata);
	await rm(paths.replacementReady, { force: true });
	return { paths, metadata, authToken };
};
