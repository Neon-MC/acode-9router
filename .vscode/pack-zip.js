import path from "path";
import fs from "fs";
import jszip from "jszip";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const iconFile = path.join(rootDir, "icon.png");
const pluginJSON = path.join(rootDir, "plugin.json");
const distFolder = path.join(rootDir, "dist");
const readmeFile = path.join(rootDir, "readme.md");
const changelogFile = path.join(rootDir, "changelogs.md");
const licenseFile = path.join(rootDir, "LICENSE");

const zip = new jszip();

if (fs.existsSync(iconFile)) zip.file("icon.png", fs.readFileSync(iconFile));
if (fs.existsSync(pluginJSON)) zip.file("plugin.json", fs.readFileSync(pluginJSON));
if (fs.existsSync(readmeFile)) zip.file("readme.md", fs.readFileSync(readmeFile));
if (fs.existsSync(changelogFile)) zip.file("changelogs.md", fs.readFileSync(changelogFile));
if (fs.existsSync(licenseFile)) zip.file("LICENSE", fs.readFileSync(licenseFile));

function loadFolder(relPath, folderPath) {
  if (!fs.existsSync(folderPath)) return;
  const entries = fs.readdirSync(folderPath);
  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry);
    const stat = fs.statSync(fullPath);
    const entryRel = relPath ? `${relPath}/${entry}` : entry;
    if (stat.isDirectory()) {
      zip.folder(entryRel);
      loadFolder(entryRel, fullPath);
    } else {
      zip.file(entryRel, fs.readFileSync(fullPath));
    }
  }
}

loadFolder("dist", distFolder);

// Also copy dist/main.js to root main.js in zip for maximum compatibility
const distMainJs = path.join(distFolder, "main.js");
if (fs.existsSync(distMainJs)) {
  zip.file("main.js", fs.readFileSync(distMainJs));
}

const outZipPath = path.join(rootDir, "acode-9router.zip");

zip
  .generateNodeStream({ type: "nodebuffer", streamFiles: true })
  .pipe(fs.createWriteStream(outZipPath))
  .on("finish", () => {
    console.log(`[Pack] Successfully generated: ${outZipPath}`);
  });
