import { expect, test } from "bun:test";
import type { Tx } from "../../db/tx.ts";
import { list } from "./list.ts";
import { testFixture } from "./testFixture";

test("the flow execution list reads one page with three queries", async () => {
	const fixture = await testFixture();
	try {
		await (await fixture.createExecution()).create();
		await (await fixture.createExecution()).create();
		let queries = 0;
		const records = await fixture.run((tx) => {
			const counted = new Proxy(tx, {
				get(target, property) {
					if (property === "execute")
						return (...args: Parameters<Tx["execute"]>) => {
							queries += 1;
							return target.execute(...args);
						};
					const value = Reflect.get(target, property, target);
					return typeof value === "function" ? value.bind(target) : value;
				},
			}) as Tx;
			return list(fixture.ctx, counted, { limit: 100, offset: 0 });
		});

		expect(records).toHaveLength(2);
		expect(queries).toBe(3);
	} finally {
		await fixture.db.$client.close();
	}
});
