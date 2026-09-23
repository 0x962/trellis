import { join } from "node:path";

// Every file of one session shares the session id as its name prefix. A
// SessionLog keeps its bytes in a `.bytes` file next to its JSON file.
export function sessionFiles(home: string, id: string) {
	return {
		session: join(home, `${id}.session.json`),
		output: join(home, `${id}.output.json`),
		outputBytes: join(home, `${id}.output.json.bytes`),
		stderr: join(home, `${id}.stderr.json`),
		stderrBytes: join(home, `${id}.stderr.json.bytes`),
		input: join(home, `${id}.input.json`),
		results: join(home, `${id}.results.jsonl`),
		events: join(home, `${id}.events.json`),
		eventsBytes: join(home, `${id}.events.json.bytes`),
		agent: join(home, `${id}.agent.json`),
	};
}

export const sessionFileSuffixes = [
	".session.json",
	".output.json",
	".output.json.bytes",
	".stderr.json",
	".stderr.json.bytes",
	".input.json",
	".results.jsonl",
	".events.json",
	".events.json.bytes",
	".agent.json",
];
