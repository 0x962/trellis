export type LangflowDomain = "authority" | "admission" | "decisions" | "stops" | "native" | "projection";

export type LangflowConnection = {
	committed(input: { executionId: string }): Promise<void>;
	recover(): Promise<void>;
};

export type LangflowConnections = Record<LangflowDomain, LangflowConnection>;

export type LangflowCommit = {
	domain: LangflowDomain;
	executionId: string;
};

export type LangflowLifecycle = {
	pauseOrdinary(): Promise<{ freezeStops(): Promise<void>; resume(): void }>;
	committed(input: LangflowCommit): void;
	stop(): Promise<void>;
};
