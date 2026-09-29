import type { AgentRun } from "@trellis/api";

export const sessionObserverInput = (run: Pick<AgentRun, "id">) => ({ sessionId: run.id });

export const sessionObserverEnabled = (observer: { enabled: boolean } | undefined) => observer?.enabled === true;

export const sessionObserverPollInterval = (observer: { enabled: boolean } | undefined) =>
	sessionObserverEnabled(observer) ? 2000 : false;
