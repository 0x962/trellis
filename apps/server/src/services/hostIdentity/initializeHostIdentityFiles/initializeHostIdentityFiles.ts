import type { IoCtx } from "../../support.ts";
import { hostIdentityPaths } from "../hostIdentity.ts";
import { readOrCreateIdentity } from "../identityStore/index.ts";

export const initializeHostIdentityFiles = async (ctx: Pick<IoCtx, "home" | "installationHome">) => {
	const paths = hostIdentityPaths(ctx);
	const [hostId] = await Promise.all([
		readOrCreateIdentity(paths.host),
		readOrCreateIdentity(paths.dataHome),
	]);
	return hostId;
};
