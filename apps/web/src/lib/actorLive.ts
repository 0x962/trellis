const liveWindowMs = 5 * 60 * 1000;

// An agent that acted within the last five minutes is live: its avatar
// carries the pulsing dot. A human is never live.
export const isLiveActor = (actor: { kind: string; at: string }, now = Date.now()) =>
	actor.kind === "agent" && now - Date.parse(actor.at) < liveWindowMs;
