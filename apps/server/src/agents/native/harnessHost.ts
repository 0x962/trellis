import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessPreset } from "@trellis/api";
import { HarnessHost } from "../harnessHost/harnessHost.ts";
import { nativeClient } from "./connection.ts";

export const nativeHost = (
	home: string,
	env: Record<string, string | undefined> = process.env,
	runtime = nativeClient(home),
) =>
	new HarnessHost({
		runtime,
		directory: join(home, "harness-attempts"),
		agents: join(home, "agents"),
		env,
		bun: process.execPath,
		observationTimeoutMs: 60000,
	});

export const nativePreset = async (home: string, id: string): Promise<HarnessPreset> =>
	JSON.parse(await readFile(join(home, "harness-attempts", id, "launch.json"), "utf8")).harness;
