import { Skeleton } from "@trellis/ui";
import type { ReactNode } from "react";
import { ConditionsBlock } from "../../../ConditionsBlock";
import type { Conditions } from "../../../conditionLines/conditionLines";

export function ReviewFacts({
	ready,
	conditions,
	children,
}: {
	ready: boolean;
	conditions: Conditions | null;
	children: ReactNode;
}) {
	if (!ready || conditions === null)
		return (
			<section aria-busy="true">
				<span className="sr-only" role="status">
					Merge conditions are loading.
				</span>
				<Skeleton lines={10} />
			</section>
		);

	return (
		<>
			<ConditionsBlock conditions={conditions} />
			{children}
		</>
	);
}
