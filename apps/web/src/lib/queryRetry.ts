export const queryRetryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000);
