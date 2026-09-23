import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessPreset } from "@trellis/api";
import type { JobsLog } from "../../jobs.ts";
import { HarnessHost } from "../harnessHost/harnessHost.ts";
import { nativeClient } from "./connection.ts";
import { agentWorkspacesRoot } from "./workspace.ts";

export const nativeHost = (
	home: string,
	env: Record<string, string | undefined> = process.env,
	runtime = nativeClient(home),
	log?: JobsLog,
) =>
	new HarnessHost({
		runtime,
		directory: join(home, "harness-attempts"),
		agentsDirectory: agentWorkspacesRoot(home),
		env,
		bun: process.execPath,
		log,
		observationTimeoutMs: 60000,
		// A launch that reports work for five minutes without a provider
		// session and an acknowledged prompt fails. The run then carries the
		// reason, and the person reads it beside the session.
		confirmationLimitMs: 300000,
	});

export const nativePreset = async (home: string, id: string): Promise<HarnessPreset> =>
	JSON.parse(await readFile(join(home, "harness-attempts", id, "launch.json"), "utf8")).harness;
