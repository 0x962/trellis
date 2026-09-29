import type { RenewalIntent, TakeoverIntent } from "../authority/authority";
import { authorityPermitBinding } from "../authorityPermit";

export function withAuthorityPermit<T extends RenewalIntent | TakeoverIntent>(input: T, engineJobId = "job-1") {
	return {
		...input,
		permit: {
			id: crypto.randomUUID(),
			dataHomeId: "data-home-a",
			generation: 1,
			binding: authorityPermitBinding(input, engineJobId),
		},
	};
}
