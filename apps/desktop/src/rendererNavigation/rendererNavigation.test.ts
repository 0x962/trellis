import { expect, test } from "bun:test";
import { createRendererNavigation } from "./rendererNavigation.ts";

test("renderer navigation keeps deep links during startup and reload", () => {
	const sent: string[] = [];
	const navigation = createRendererNavigation((path) => sent.push(path));

	navigation.navigate("/t/TRL-1");
	expect(navigation.initialPath()).toBe("/t/TRL-1");
	navigation.navigate("/t/TRL-2");
	expect(sent).toEqual([]);
	navigation.rendererReady();
	expect(sent).toEqual(["/t/TRL-2"]);

	navigation.navigate("/t/TRL-3");
	expect(sent).toEqual(["/t/TRL-2", "/t/TRL-3"]);
	navigation.startLoad();
	navigation.navigate("/t/TRL-4");
	expect(sent).toEqual(["/t/TRL-2", "/t/TRL-3"]);
	navigation.rendererReady();
	expect(sent).toEqual(["/t/TRL-2", "/t/TRL-3", "/t/TRL-4"]);
});
