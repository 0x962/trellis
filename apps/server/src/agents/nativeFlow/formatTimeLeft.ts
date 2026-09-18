// "about 12 min" above one minute, "40 s" under it. A worker reads this in
// its prompt and in a time warning.
export const formatTimeLeft = (ms: number) =>
	ms >= 60_000 ? `about ${Math.round(ms / 60_000)} min` : `${Math.max(1, Math.ceil(ms / 1000))} s`;
