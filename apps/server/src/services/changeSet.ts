import type { SQL } from "drizzle-orm";
import type { Change } from "./activity.ts";

type Scalar = string | number | boolean | null;

const text = (value: Scalar) => (value === null ? null : String(value));

// Collects the SET clauses of one UPDATE and the activity rows that go with
// them. `field` adds both when `to` is present and differs from `from`, so a
// value sent back unchanged writes nothing.
export const changeSet = () => {
	const sets: SQL[] = [];
	const changes: Change[] = [];
	const field = <T extends Scalar>(name: string, from: T, to: T | undefined, set: SQL) => {
		if (to === undefined || to === from) return;
		sets.push(set);
		changes.push({ field: name, from: text(from), to: text(to) });
	};
	return { sets, changes, field };
};
