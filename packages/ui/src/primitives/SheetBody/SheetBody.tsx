import type { ReactNode } from "react";

export function SheetBody({ children }: { children: ReactNode }) {
	return <div className="flex flex-1 flex-col gap-6 p-6 max-md:p-4">{children}</div>;
}
