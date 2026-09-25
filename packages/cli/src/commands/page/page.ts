import { defineCommand } from "citty";
import { list, show, versions } from "./inspect.ts";
import { pin, rename, restore, rm, unpin } from "./manage.ts";
import { publish } from "./publish.ts";
import { pull } from "./pull.ts";

export default defineCommand({
	meta: { name: "page", description: "Publish, read, and manage the pages of a project" },
	subCommands: { publish, list, show, versions, pull, rename, pin, unpin, rm, restore },
});
