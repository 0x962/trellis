import { prepareNativeExecutable } from "./setup/setup.ts";

const setup = await prepareNativeExecutable(await Bun.file(process.argv[2]!).json());
process.stdout.write(`${JSON.stringify({ setupFile: `${setup.root}/setup.json`, proof: setup.proof })}\n`);
