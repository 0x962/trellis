import { z } from "zod";
import type { OciRun } from "../../../ociDriver/process/process";
import { assertVolume, createVolume, inspectVolume } from "../../../ociDriver/storage/storage";
import type { EngineInstallIntent } from "../../contracts";

export async function inspectEngineDestination(run: OciRun, intent: EngineInstallIntent) {
	const image = await run(["image", "inspect", intent.package.imageConfigDigest]);
	if (image.exitCode !== 0) throw new Error("restored_engine_image_unavailable");
	const [actual] = z.array(z.object({
		Id: z.string(), Os: z.literal("linux"), Architecture: z.string(),
		Config: z.object({ Env: z.array(z.string()) }),
	})).length(1).parse(JSON.parse(image.stdout));
	if (actual!.Id !== intent.package.imageConfigDigest || actual!.Architecture !== intent.package.architecture ||
		actual!.Config.Env.filter((entry) => entry.startsWith("LANGFLOW_DATABASE_URL=")).join("") !==
		"LANGFLOW_DATABASE_URL=sqlite:////data/config/langflow.db")
		throw new Error("restored_engine_image_identity_conflict");
	const volumes = [];
	for (const kind of ["data", "secrets"] as const) {
		const name = intent.target.volumes[kind];
		const containers = await run(["container", "ls", "--all", "--quiet", "--filter", `volume=${name}`]);
		if (containers.exitCode !== 0 || containers.stdout.trim() !== "")
			throw new Error("restored_engine_container_present_or_unknown");
		const inspected = await inspectVolume(run, name);
		if (inspected.state === "unknown") throw new Error("restored_engine_volume_unknown");
		if (inspected.state === "found") assertVolume(inspected.value, intent.identity, intent.target.privateRootDigest, kind);
		volumes.push({ kind, state: inspected.state });
	}
	return volumes;
}

export async function createEngineDestination(run: OciRun, intent: EngineInstallIntent) {
	for (const kind of ["data", "secrets"] as const)
		await createVolume(run, intent.identity, intent.target.privateRootDigest, kind);
}
