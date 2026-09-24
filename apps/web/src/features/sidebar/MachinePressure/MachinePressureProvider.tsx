import type { MachinePressureMachineView } from "@trellis/ui";
import { createContext, type ReactNode, useCallback, useState } from "react";
import { useMachinePressure } from "./useMachinePressure";

type MachinePressureContextValue = {
	machines: MachinePressureMachineView[];
	setDetailsOpen: (id: string, open: boolean) => void;
};

export const MachinePressureContext = createContext<MachinePressureContextValue | null>(null);

// The desktop body and the phone sheet can stay mounted together. This
// provider gives both rows one pressure sample lifecycle.
export function MachinePressureProvider({ children }: { children: ReactNode }) {
	const [openConsumers, setOpenConsumers] = useState<Set<string>>(() => new Set());
	const setDetailsOpen = useCallback((id: string, open: boolean) => {
		setOpenConsumers((current) => {
			if (current.has(id) === open) return current;
			const next = new Set(current);
			if (open) next.add(id);
			else next.delete(id);
			return next;
		});
	}, []);
	const machines = useMachinePressure(openConsumers.size > 0);
	return (
		<MachinePressureContext.Provider value={{ machines, setDetailsOpen }}>{children}</MachinePressureContext.Provider>
	);
}
