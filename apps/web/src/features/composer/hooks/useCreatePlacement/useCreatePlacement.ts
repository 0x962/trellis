import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../lib/appContext";

export function useCreatePlacement(project?: string, epic?: string, wave?: string | null, allowLoose = false) {
	const { orpc } = useApp();
	const list = useQuery({
		...orpc.epics.list.queryOptions({ input: { project: project ?? "" } }),
		enabled: project !== undefined,
		retry: false,
	});
	const epics = list.data;
	const selected = epics?.find((entry) => entry.ref === epic || entry.id === epic);
	const soleDefault = epics?.length === 1 && epics[0]?.slug === "default" ? epics[0] : undefined;
	const chosenEpic = selected ?? (epic === undefined ? soleDefault : undefined);
	const newEpic = epics?.length === 0;
	const detail = useQuery({
		...orpc.epics.get.queryOptions({ input: { epic: chosenEpic?.ref ?? "" } }),
		enabled: chosenEpic !== undefined,
		retry: false,
	});
	const waves = detail.data?.waves;
	const chosenWave = waves?.find((entry) => entry.ref === wave || entry.id === wave);
	const loose = allowLoose && wave === null && chosenEpic !== undefined;
	const newWave = !loose && (newEpic || waves?.length === 0);
	const pending = project !== undefined && (list.isPending || (chosenEpic !== undefined && detail.isPending));
	const error = list.error ?? (chosenEpic !== undefined ? detail.error : null);
	const ready =
		project !== undefined &&
		!pending &&
		!error &&
		(newEpic || (chosenEpic !== undefined && (loose || newWave || chosenWave !== undefined)));
	return {
		allowLoose,
		epic: chosenEpic?.ref,
		wave: loose ? null : chosenWave?.ref,
		epicName: chosenEpic?.name ?? (newEpic ? "Default (new)" : "Choose an epic"),
		waveName: chosenWave?.name ?? (loose ? "No wave" : newWave ? "Default (new)" : "Choose a wave"),
		newEpic,
		newWave,
		ready,
		error,
		fetching: list.isFetching || detail.isFetching,
		retry: () => Promise.all([list.refetch(), ...(chosenEpic ? [detail.refetch()] : [])]),
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
