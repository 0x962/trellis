import { expect, test } from "bun:test";
import { join } from "node:path";

test("the empty Needs you page depends only on shared page chrome", async () => {
	const source = await Bun.file(join(import.meta.dir, "NeedsYou.tsx")).text();
	const imports = new Bun.Transpiler({ loader: "tsx" }).scanImports(source);
	expect(
		imports
			.map(({ path }) => path)
			.filter((path) => !path.startsWith("react"))
			.sort(),
	).toEqual(["../../shell/PageTitle", "../../shell/Topbar"]);
});
