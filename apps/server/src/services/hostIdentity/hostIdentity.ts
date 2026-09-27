import { join } from "node:path";
import { RUNTIME_PROTOCOL_VERSION } from "@trellis/runtime-protocol";
import type { Tx } from "../../db/tx.ts";
import type { IoCtx, PrepareCtx, ServiceCtx } from "../support.ts";
import { readIdentity } from "./identityStore/index.ts";

export const HOST_IDENTITY_FILE = "host-identity";
export const DATA_HOME_IDENTITY_FILE = "data-home-identity";
export const HOST_IDENTITY_CAPABILITIES = ["host-identity"] as const;

export type HostIdentityContext = Pick<IoCtx, "apiVersion" | "home" | "installationHome" | "log"> &
	Pick<PrepareCtx, "releaseId">;

export type HostIdentityDependencies = {
	readIdentity: (path: string) => Promise<string>;
	runtimeProtocol: number;
	platform: "darwin" | "linux";
	arch: "x64" | "arm64";
	capabilities: readonly string[];
};

export const hostIdentityPaths = (ctx: Pick<HostIdentityContext, "home" | "installationHome">) => ({
	host: join(ctx.installationHome, HOST_IDENTITY_FILE),
	dataHome: join(ctx.home, DATA_HOME_IDENTITY_FILE),
});

export const readHostDescriptor = async (ctx: HostIdentityContext, deps: HostIdentityDependencies) => {
	const paths = hostIdentityPaths(ctx);
	const [hostId, dataHomeId] = await Promise.all([deps.readIdentity(paths.host), deps.readIdentity(paths.dataHome)]);
	return {
		hostId,
		dataHomeId,
		apiVersion: ctx.apiVersion,
		runtimeProtocol: deps.runtimeProtocol,
		releaseId: ctx.releaseId,
		platform: deps.platform,
		arch: deps.arch,
		capabilities: [...deps.capabilities],
	};
};

export const prepareDescribe = async (ctx: HostIdentityContext, _input: Record<string, never>) => {
	const descriptor = await readHostDescriptor(ctx, {
		readIdentity,
		runtimeProtocol: RUNTIME_PROTOCOL_VERSION,
		platform: process.platform as "darwin" | "linux",
		arch: process.arch as "x64" | "arm64",
		capabilities: HOST_IDENTITY_CAPABILITIES,
	});
	ctx.log("host identity", { hostId: descriptor.hostId, dataHomeId: descriptor.dataHomeId });
	return descriptor;
};

export const describe = async (_ctx: ServiceCtx, _tx: Tx, descriptor: Awaited<ReturnType<typeof prepareDescribe>>) =>
	descriptor;
