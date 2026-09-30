import { dirname } from "node:path";
import { restoreStartupRequired } from "../components/context";
import {
	assertRestoredStartScope,
	type RestoredStartBinding,
	type RestoredStartScope,
} from "../withRestoredEngineStart/withRestoredEngineStart";

export function restoredDriverScope(scope: RestoredStartScope | undefined, binding: RestoredStartBinding) {
	if (restoreStartupRequired(dirname(binding.privateRoot)) && !scope)
		throw new Error("restored_startup_scope_required");
	return scope ? assertRestoredStartScope(scope, binding) : undefined;
}
