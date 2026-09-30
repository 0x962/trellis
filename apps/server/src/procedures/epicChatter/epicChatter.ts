import { call, os } from "../base.ts";

export const epicChatter = os.epicChatter.router({
	get: os.epicChatter.get.handler(({ context, input }) => call(context, "epicChatter.get", input)),
	set: os.epicChatter.set.handler(({ context, input }) => call(context, "epicChatter.set", input)),
	list: os.epicChatter.list.handler(({ context, input }) => call(context, "epicChatter.list", input)),
});
