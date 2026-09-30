import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const [directory, output] = process.argv.slice(2) as [string, string];
const assetDirectory = join(directory, "assets");
const names = await readdir(assetDirectory);
const scriptName = names.find((name) => name.endsWith(".js")) as string;
const styleName = names.find((name) => name.endsWith(".css")) as string;
let script = await readFile(join(assetDirectory, scriptName), "utf8");
let styles = await readFile(join(assetDirectory, styleName), "utf8");

for (const name of names.filter((item) => /\.(woff2|jpg)$/.test(item))) {
	const mime = name.endsWith(".woff2") ? "font/woff2" : "image/jpeg";
	const data = `data:${mime};base64,${(await readFile(join(assetDirectory, name))).toString("base64")}`;
	styles = styles.replaceAll(`./${name}`, data).replaceAll(name, data);
	script = script.replaceAll(`new URL(\`${name}\`,import.meta.url).href`, JSON.stringify(data));
}

const document = (await readFile(join(directory, "index.html"), "utf8"))
	.replace(
		/<script[^>]+src="[^"]+"[^>]*><\/script>/,
		() => `<script type="module">${script.replaceAll("</script", "<\\/script")}</script>`,
	)
	.replace(/<link[^>]+rel="stylesheet"[^>]*>/, () => `<style>${styles}</style>`);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, document);
process.stdout.write(`Standalone prototype: ${output}\n`);
