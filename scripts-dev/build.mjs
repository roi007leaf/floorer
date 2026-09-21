import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "module.json"), "utf8"));
const out = resolve(root, "dist");
mkdirSync(out, { recursive: true });
const zip = resolve(out, "floorer.zip");
const include = ["module.json", "README.md", "CHANGELOG.md", "LICENSE", "scripts", "styles", "templates", "lang"].filter((p) => existsSync(resolve(root, p)));
const tar = process.platform === "win32" ? resolve(process.env.SystemRoot, "System32", "tar.exe") : "tar";
execSync(`"${tar}" -a -cf "dist/floorer.zip" ${include.join(" ")}`, { cwd: root, stdio: "inherit" });
createWriteStream(resolve(out, "module.json")).end(JSON.stringify(manifest, null, 2));
console.log(`built ${zip} for ${manifest.id} ${manifest.version}`);
