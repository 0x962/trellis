import { pickErrors } from "../../errors.ts";
import {
	EpicChatterInputSchema,
	EpicChatterListInputSchema,
	EpicChatterPageSchema,
	EpicChatterSetInputSchema,
	EpicChatterSettingsSchema,
} from "../../schemas/epicChatter";
import { base } from "../base.ts";

export const epicChatter = {
	get: base
		.route({ method: "GET", path: "/epic-chatter/settings/{+epic}", summary: "Read Chatter settings" })
		.input(EpicChatterInputSchema)
		.output(EpicChatterSettingsSchema),
	set: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({ method: "PATCH", path: "/epic-chatter/settings/{+epic}", summary: "Turn Chatter on or off" })
		.input(EpicChatterSetInputSchema)
		.output(EpicChatterSettingsSchema),
	list: base
		.route({ method: "GET", path: "/epic-chatter/messages/{+epic}", summary: "Read agent messages for an epic" })
		.input(EpicChatterListInputSchema)
		.output(EpicChatterPageSchema),
};
