import { base } from "../contract/base.ts";
import { HostDescriptorSchema } from "./hostIdentity.ts";

export const hostIdentity = {
	describe: base
		.route({ method: "GET", path: "/host-identity", summary: "Read the stable identity of this host" })
		.output(HostDescriptorSchema),
};
