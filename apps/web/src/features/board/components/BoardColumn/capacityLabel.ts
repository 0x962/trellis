export const capacityLabel = (count: number, limit: number | null) =>
	`${count} of ${limit === null ? "unlimited" : limit} tickets`;
