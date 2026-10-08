import { useRef, useState } from "react";

export type StatusWrite = (operation: () => Promise<void>) => Promise<void>;

export function useStatusWrite() {
	const writingRef = useRef(false);
	const [busy, setBusy] = useState(false);

	const write: StatusWrite = async (operation) => {
		if (writingRef.current) return;
		writingRef.current = true;
		setBusy(true);
		try {
			await operation();
		} finally {
			writingRef.current = false;
			setBusy(false);
		}
	};

	return { busy, write };
}
