import { HostDescriptorSchema } from "../../hostIdentity/index.ts";
import { base } from "../base.ts";

export const hostIdentity = {
	describe: base
		.route({ method: "GET", path: "/host-identity", summary: "Read the stable identity of this host" })
		.output(HostDescriptorSchema),
};
