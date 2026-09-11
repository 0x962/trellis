import { describe, expect, test } from "bun:test";
import { AGENT_PERSON_NAME_MAX, AGENT_PERSON_NAMES, pickAgentPersonName } from "./agentPersonNames.ts";

// A person a human can call by name: the pool holds the names, and
// pickAgentPersonName hands one to a new agent.

describe("AGENT_PERSON_NAMES", () => {
	test("holds one word per name, with no repeat", () => {
		expect(new Set(AGENT_PERSON_NAMES).size).toBe(AGENT_PERSON_NAMES.length);
		for (const name of AGENT_PERSON_NAMES) expect(name).toMatch(/^[A-Z][a-z]{1,15}$/);
	});

	test("holds far more names than the agents of one project", () => {
		expect(AGENT_PERSON_NAMES.length).toBeGreaterThanOrEqual(100);
	});

	test("every name and every repeat of it fits the stored column", () => {
		const longest = [...AGENT_PERSON_NAMES].sort((a, b) => b.length - a.length)[0]!;
		expect(`${longest} 99`.length).toBeLessThanOrEqual(AGENT_PERSON_NAME_MAX);
	});
});

describe("pickAgentPersonName", () => {
	test("takes a name of the pool", () => {
		expect(AGENT_PERSON_NAMES).toContain(pickAgentPersonName([]));
	});

	test("`random` chooses where the search starts, so a fresh install gets fresh names", () => {
		expect(pickAgentPersonName([], () => 0)).toBe(AGENT_PERSON_NAMES[0]);
		expect(pickAgentPersonName([], () => 0.5)).toBe(AGENT_PERSON_NAMES[Math.floor(AGENT_PERSON_NAMES.length / 2)]);
	});

	test("passes over a taken name", () => {
		const [first, second] = AGENT_PERSON_NAMES;
		expect(pickAgentPersonName([first!], () => 0)).toBe(second!);
	});

	test("a name that no agent holds comes back free", () => {
		const taken = AGENT_PERSON_NAMES.slice(0, 10);
		for (let step = 0; step < 20; step += 1) {
			expect(taken).not.toContain(pickAgentPersonName(taken));
		}
	});

	test("with every name taken it adds a number, and repeats that", () => {
		const pool = [...AGENT_PERSON_NAMES];
		expect(pickAgentPersonName(pool, () => 0)).toBe(`${pool[0]} 2`);
		const twice = [...pool, ...pool.map((name) => `${name} 2`)];
		expect(pickAgentPersonName(twice, () => 0)).toBe(`${pool[0]} 3`);
	});
});
