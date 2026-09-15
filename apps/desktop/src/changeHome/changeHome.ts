import type { ExistingHome } from "../inspectExistingHome/inspectExistingHome.ts";

export type HomeChangeActions = {
	choose: () => Promise<string | null>;
	inspect: (path: string) => Promise<ExistingHome>;
	confirm: (candidate: ExistingHome) => Promise<boolean>;
	prepare: (candidate: ExistingHome) => Promise<void>;
	stopCurrent: () => Promise<void>;
	persist: (home: string) => Promise<void>;
	start: () => Promise<void>;
	startFailed: (error: unknown) => Promise<void>;
	relaunch: () => void;
};

export const changeHome = async (current: string, actions: HomeChangeActions): Promise<boolean> => {
	const path = await actions.choose();
	if (path === null) return false;
	const candidate = await actions.inspect(path);
	if (candidate.home === current) return false;
	if (!(await actions.confirm(candidate))) return false;
	await actions.prepare(candidate);
	await actions.stopCurrent();
	const ready = await actions.inspect(candidate.home);
	if (ready.home !== candidate.home)
		throw new Error("The selected directory changed after confirmation. Choose it again.");
	if (ready.owner || ready.runtime)
		throw new Error(`A process still owns ${candidate.home}. The selected directory has not changed.`);
	await actions.persist(candidate.home);
	try {
		await actions.start();
	} catch (error) {
		await actions.startFailed(error);
	}
	actions.relaunch();
	return true;
};
