import { core } from "../../registryEntry";
import { get, history, setEnabledForProcedure } from "../index.ts";

export const sessionObserverServices = {
	"sessionObservers.get": core("read", get),
	"sessionObservers.history": core("read", history),
	"sessionObservers.setEnabled": core("mutation", setEnabledForProcedure),
};
