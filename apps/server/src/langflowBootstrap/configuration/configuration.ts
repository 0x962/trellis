import { isAbsolute } from "node:path";
import { z } from "zod";
import { QualificationRuntimeSchema } from "../../../../../integrations/langflow/release";
import { readPrivateConfiguration } from "../privateConfiguration";

const path = z.string().refine(isAbsolute, "An absolute path is required.");
const origin = z.url().refine((value) => {
	const parsed = new URL(value);
	return ["http:", "https:"].includes(parsed.protocol) && parsed.origin === value;
}, "An exact HTTP or HTTPS origin is required.");

export const LangflowBootstrapConfigurationSchema = z.strictObject({
	version: z.literal(1),
	packageRoot: path,
	packageId: z.string().regex(/^[a-f0-9]{64}$/),
	qualificationFile: path,
	qualificationSha256: z.string().regex(/^[a-f0-9]{64}$/),
	runtime: QualificationRuntimeSchema,
	expectedHostId: z.uuid(),
	expectedDataHomeId: z.uuid(),
	parentOrigin: origin,
	editorOrigin: origin,
	engineApiConfigFile: path,
	captureIssuerFile: path,
	nativeReservationAuthenticationFile: path,
	grantDurationMs: z.number().int().positive().optional(),
}).refine((value) => value.parentOrigin !== value.editorOrigin, "The editor requires a separate origin.");

export type LangflowBootstrapConfiguration = z.infer<typeof LangflowBootstrapConfigurationSchema>;

export async function readLangflowBootstrapConfiguration(filePath: string): Promise<LangflowBootstrapConfiguration> {
	const sourceBytes = await readPrivateConfiguration(filePath);
	return LangflowBootstrapConfigurationSchema.parse(
		JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes)),
	);
}
