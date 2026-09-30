import { systemContext } from "../../context";
import type { ServiceTransport } from "../../db/transport";
import type { recoverPairedRuntimeFinalization } from "../../services/langflowBackup";

type Input = Parameters<typeof recoverPairedRuntimeFinalization>[1];
type Result = Awaited<ReturnType<typeof recoverPairedRuntimeFinalization>>;

export function runtimeRecoveryTransport(transport: Pick<ServiceTransport, "call">) {
	return {
		recoverPairedRuntimeFinalization: (input: Input): Promise<Result> =>
			transport.call("langflowBackup.recoverRuntimeFinalization", systemContext(), input) as Promise<Result>,
	};
}
