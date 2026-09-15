import { expect, test } from "bun:test";
import { managerResumes } from "./managerResumes";

const external = { runtime: "superset" as const, sessionId: "old-chat", workspaceId: "old-workspace", error: null };
test("a stopped external session cannot resume as a native manager", () => {
	expect(managerResumes(external, "native")).toBe(false);
	expect(managerResumes(external, "superset")).toBe(true);
});
test("native sessions resume, while retired or absent assignments start fresh", () => {
	expect(managerResumes({ ...external, runtime: "native" }, "native")).toBe(true);
	expect(managerResumes({ ...external, error: "External assignment retired by dana." }, "superset")).toBe(false);
	expect(managerResumes(undefined, "native")).toBe(false);
});
