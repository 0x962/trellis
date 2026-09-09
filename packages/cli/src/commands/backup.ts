import { defineCommand } from "citty";
import { contextOf } from "../context.ts";

// The verb needs a live server process, which a later work item delivers.
export default defineCommand({
	meta: { name: "backup" },
	run(context) {
		contextOf(context).out.write("backup: not yet\n");
	},
});
