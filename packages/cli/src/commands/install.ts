import { defineCommand } from "citty";
import { contextOf } from "../context.ts";

// The verb needs a live server process, which a later work item delivers.
export default defineCommand({
	meta: { name: "install" },
	run(context) {
		contextOf(context).out.write("install: not yet\n");
	},
});
