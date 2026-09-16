import { modelsForHarness } from "@trellis/api";
import { os } from "./base.ts";

export const models = os.models.router({
	list: os.models.list.handler(({ input }) => modelsForHarness(input.harness)),
});
