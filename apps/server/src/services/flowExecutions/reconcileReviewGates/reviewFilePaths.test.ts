import { expect, test } from "bun:test";
import { reviewFilePaths } from "./reviewFilePaths.ts";

test("keeps production paths and removes unrelated paths", () => {
	expect(
		reviewFilePaths([
			"apps/web/src/AccountPage.tsx",
			"apps/server/drizzle/0151_account.sql",
			"apps/web/src/AccountPage.test.tsx",
			"apps/server/src/fixtures/account.fixture.ts",
			"apps/web/src/__snapshots__/AccountPage.snap",
			"apps/web/src/AccountPage.stories.tsx",
			"docs/account.md",
			"bun.lock",
			"tools/site/dist/app.js",
			"apps/web/src/AccountPage.tsx",
			"tests/migrations/fixture.sql",
		]),
	).toEqual(["apps/web/src/AccountPage.tsx", "apps/server/drizzle/0151_account.sql"]);
});

test("keeps production paths with exclusion words", () => {
	expect(
		reviewFilePaths([
			"src/testing/service.ts",
			"src/contest/entry.ts",
			"src/fixtureFactory.ts",
			"src/snapshotService.ts",
			"src/storybookConfig.ts",
			"src/docsGenerator.ts",
			"src/buildPipeline.ts",
			"apps/web/src/pages/pricing.mdx",
			"prompts/review.md",
			"content/legal.rst",
			"content/help.adoc",
			"apps/desktop/build/icon.icns",
		]),
	).toEqual([
		"src/testing/service.ts",
		"src/contest/entry.ts",
		"src/fixtureFactory.ts",
		"src/snapshotService.ts",
		"src/storybookConfig.ts",
		"src/docsGenerator.ts",
		"src/buildPipeline.ts",
		"apps/web/src/pages/pricing.mdx",
		"prompts/review.md",
		"content/legal.rst",
		"content/help.adoc",
		"apps/desktop/build/icon.icns",
	]);
});

test("removes unrelated migration paths before it keeps a real migration", () => {
	expect(
		reviewFilePaths([
			"apps/server/migrations/0151_account.sql",
			"apps/server/migrations/account.test.sql",
			"apps/server/migrations/fixtures/account.sql",
			"apps/server/migrations/__snapshots__/account.snap",
			"apps/server/migrations/account.stories.sql",
			"apps/server/migrations/docs/account.md",
		]),
	).toEqual(["apps/server/migrations/0151_account.sql"]);
});

test("removes exact output directories at any path depth", () => {
	expect(
		reviewFilePaths([
			"tools/site/dist/app.js",
			"tools/site/coverage/report.json",
			"tools/site/out/app.js",
			"tools/site/.next/app.js",
			"tools/site/src/buildPipeline.ts",
			"apps/desktop/build/icon.icns",
		]),
	).toEqual(["tools/site/src/buildPipeline.ts", "apps/desktop/build/icon.icns"]);
});
