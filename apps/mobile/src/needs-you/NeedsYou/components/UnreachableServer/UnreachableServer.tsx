import type { ReactElement } from "react";

export type UnreachableServerProps = {
	// The stored server without its scheme, such as 192.168.1.20:4521.
	host: string;
	onRetry: () => void;
	onChangeServer: () => void;
};

export function UnreachableServer(_props: UnreachableServerProps): ReactElement {
	throw new Error("mobile-inbox: UnreachableServer is not implemented");
}
