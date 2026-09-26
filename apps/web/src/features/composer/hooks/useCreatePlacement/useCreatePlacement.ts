import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../lib/appContext";

export function useCreatePlacement(project?: string, epic?: string, wave?: string) {
	const { orpc } = useApp();
	const list = useQuery({
		...orpc.epics.list.queryOptions({ input: { project: project ?? "" } }),
		enabled: project !== undefined,
	});
	const epics = list.data;
	const selected = epics?.find((entry) => entry.ref === epic || entry.id === epic);
	const soleDefault = epics?.length === 1 && epics[0]?.slug === "default" ? epics[0] : undefined;
	const chosenEpic = selected ?? (epic === undefined ? soleDefault : undefined);
	const newEpic = epics?.length === 0;
	const detail = useQuery({
		...orpc.epics.get.queryOptions({ input: { epic: chosenEpic?.ref ?? "" } }),
		enabled: chosenEpic !== undefined,
	});
	const waves = detail.data?.waves;
	const selectedWave = waves?.find((entry) => entry.ref === wave || entry.id === wave);
	const soleDefaultWave = waves?.length === 1 && waves[0]?.slug === "default" ? waves[0] : undefined;
	const chosenWave = selectedWave ?? (wave === undefined ? soleDefaultWave : undefined);
	const newWave = newEpic || waves?.length === 0;
	const pending = project !== undefined && (list.isPending || (chosenEpic !== undefined && detail.isPending));
	const error = list.isError || (chosenEpic !== undefined && detail.isError);
	const ready =
		project !== undefined &&
		!pending &&
		!error &&
		(newEpic || (chosenEpic !== undefined && (newWave || chosenWave !== undefined)));
	return {
		epic: chosenEpic?.ref,
		wave: chosenWave?.ref,
		epicName: chosenEpic?.name ?? (newEpic ? "Default (new)" : "Choose an epic"),
		waveName: chosenWave?.name ?? (newWave ? "Default (new)" : "Choose a wave"),
		newEpic,
		newWave,
		ready,
		message: error
			? "The epic or wave could not load."
			: pending
				? "Load epics and waves…"
				: ready
					? undefined
					: chosenEpic === undefined
						? "Choose an epic."
						: "Choose a wave.",
	};
}
