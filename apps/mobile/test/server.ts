import { readFileSync, writeFileSync } from "node:fs";
import { createTrellisClient, type TrellisClient } from "@trellis/api";
import { httpFetch } from "./httpFetch";
import type { Seeder } from "./seed";

// The one server the Jest suite talks to. globalSetup spawns it and writes
// its URL and its gh reply file into these two variables.
export const serverUrl = process.env.TRELLIS_TEST_SERVER_URL!;
export const serverHost = new URL(serverUrl).host;
export const actorName = "dana";

// The fetch that reaches the socket. A test replaces globalThis.fetch to
// record the calls of the screen it renders, so every seed holds this one and
// stays out of that recording.
export const directFetch = httpFetch;

export const clientAs = (actor: string): TrellisClient =>
	createTrellisClient(serverUrl, actor, (request, init) => directFetch(request, init));

// The person the app writes as, and the agent a seeded ticket comes from.
export const human = clientAs(`human:${actorName}`);
export const agent = clientAs("agent:claude-code");

// The stub answers a gh call by its first two arguments. A seed writes the
// `api graphql` reply before it links a pull request, and the stub reads the
// file on every spawn, so the answer belongs to that one link.
export const setGhReply = (key: string, stdout: string) => {
	const file = process.env.TRELLIS_TEST_GH_REPLIES!;
	const replies = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
	writeFileSync(file, JSON.stringify({ ...replies, [key]: { stdout, stderr: "", exitCode: 0 } }));
};

// The seeder every Jest file fills its project with.
export const seeder: Seeder = { human, agent, setGhReply };
