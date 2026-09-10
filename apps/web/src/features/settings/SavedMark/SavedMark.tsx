import { cx } from "@trellis/ui";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";

export type SavedMarkProps = {
	// Changes on every save, such as the save time. A new value shows the
	// mark again.
	savedAt: number | null;
};

// How long the mark stays at full strength before it fades.
const holdMs = 1500;

// "Saved" beside a setting after the server stored it. The mark fades after
// 1.5 s and stays in the page as a status for assistive tech.
export function SavedMark({ savedAt }: SavedMarkProps) {
	const [fresh, setFresh] = useState(false);
	useEffect(() => {
		if (savedAt === null) return;
		setFresh(true);
		const timer = setTimeout(() => setFresh(false), holdMs);
		return () => clearTimeout(timer);
	}, [savedAt]);
	if (savedAt === null) return null;
	return (
		<span
			role="status"
			className={cx(
				"inline-flex items-center gap-1 text-xs text-success transition-opacity duration-popover ease-out",
				fresh ? "opacity-100" : "opacity-0",
			)}
		>
			<Check aria-hidden="true" className="size-3" />
			Saved
		</span>
	);
}
