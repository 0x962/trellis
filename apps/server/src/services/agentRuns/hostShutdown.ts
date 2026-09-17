const homes = new Set<string>();

export function beginHostShutdown(home: string) {
	homes.add(home);
}

export function hostIsShuttingDown(home: string) {
	return homes.has(home);
}
