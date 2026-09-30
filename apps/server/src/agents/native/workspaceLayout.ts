import { join } from "node:path";

export const agentWorkspacesRoot = (home: string) => join(home, "agents");
export const agentWorkspace = (home: string, runId: string) => join(agentWorkspacesRoot(home), runId, "work");
