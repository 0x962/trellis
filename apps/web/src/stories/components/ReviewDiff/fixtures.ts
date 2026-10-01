export const oldLines = Array.from({ length: 30 }, (_, index) =>
	index === 10 ? "return [];" : `const step${index + 1} = steps[${index}];`,
);
export const newLines = oldLines.map((line, index) => (index === 10 ? "return selectedTickets;" : line));

export const patch = [
	"diff --git a/src/project.ts b/src/project.ts",
	"--- a/src/project.ts",
	"+++ b/src/project.ts",
	"@@ -8,6 +8,6 @@",
	...oldLines.slice(7, 10).map((line) => ` ${line}`),
	"-return [];",
	"+return selectedTickets;",
	...oldLines.slice(11, 13).map((line) => ` ${line}`),
	"",
].join("\n");

export const binaryPatch = [
	"diff --git a/public/mark.png b/public/mark.png",
	"index 0123456..abcdef0 100644",
	"Binary files a/public/mark.png and b/public/mark.png differ",
	"",
].join("\n");

export const renamedPatch = [
	"diff --git a/src/oldName.ts b/src/newName.ts",
	"similarity index 100%",
	"rename from src/oldName.ts",
	"rename to src/newName.ts",
	"",
].join("\n");

export const anchor = { path: "src/project.ts", side: "new" as const, line: 11, startLine: 11 };
