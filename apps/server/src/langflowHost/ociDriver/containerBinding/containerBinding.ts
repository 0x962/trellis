import type { SidecarIdentity } from "../../contracts";
import { assertContainer, type ContainerInspection } from "../identity/identity";

export function assertContainerBinding(
	container: ContainerInspection,
	identity: SidecarIdentity,
	image: { reference: string; configDigest: string },
	storage: { data: string; secrets: string },
	configuration: { digest: string | null },
	nativeReservationAuthenticationDigest: string,
) {
	assertContainer(
		container,
		identity,
		image,
		storage,
		configuration.digest,
		nativeReservationAuthenticationDigest,
	);
}
