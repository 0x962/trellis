import type { FlowDiscoveryFilters } from "../flowDiscovery";

const prefix = "trellis.flow-discovery.";

export const discoveryPosition = {
	readFilters(storage: Pick<Storage, "getItem">): FlowDiscoveryFilters {
		return { query: storage.getItem(`${prefix}query`) ?? "", project: storage.getItem(`${prefix}project`) };
	},
	writeFilters(storage: Pick<Storage, "setItem" | "removeItem">, filters: FlowDiscoveryFilters) {
		storage.setItem(`${prefix}query`, filters.query);
		if (filters.project === null) storage.removeItem(`${prefix}project`);
		else storage.setItem(`${prefix}project`, filters.project);
		storage.setItem(`${prefix}scroll`, "0");
	},
	readScroll(storage: Pick<Storage, "getItem">) {
		return Number(storage.getItem(`${prefix}scroll`) ?? 0);
	},
	writeScroll(storage: Pick<Storage, "setItem">, value: number) {
		storage.setItem(`${prefix}scroll`, String(value));
	},
};
