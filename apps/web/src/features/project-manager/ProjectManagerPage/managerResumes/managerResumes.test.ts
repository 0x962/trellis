import { expect, test } from "bun:test";
import { managerResumes } from "./managerResumes";

const session = { runtime: "native" as const, sessionId: "chat", workspaceId: "workspace" };
test("only a local manager with both session identifiers can resume", () => {
	expect(managerResumes(session)).toBe(true);
	expect(managerResumes({ ...session, runtime: "superset" })).toBe(false);
	expect(managerResumes({ ...session, sessionId: null })).toBe(false);
	expect(managerResumes({ ...session, workspaceId: null })).toBe(false);
	expect(managerResumes(undefined)).toBe(false);
});
