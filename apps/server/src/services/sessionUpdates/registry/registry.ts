import { core } from "../../registryEntry";
import { get, write } from "../index.ts";

export const sessionUpdateServices = {
	"sessionUpdates.get": core("read", get),
	"sessionUpdates.write": core("mutation", write),
};
