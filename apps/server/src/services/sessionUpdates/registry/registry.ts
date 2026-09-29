import { core } from "../../registryEntry";
import * as sessionUpdates from "../sessionUpdates.ts";

export const sessionUpdateServices = {
	"sessionUpdates.get": core("read", sessionUpdates.get),
	"sessionUpdates.write": core("mutation", sessionUpdates.write),
};
