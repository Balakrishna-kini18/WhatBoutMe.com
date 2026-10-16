import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);

let sharp;
try {
  sharp = require("../apps/marketing/node_modules/sharp");
} catch {
  try {
    sharp = require("sharp");
  } catch (err) {
    console.error("Failed to load sharp:", err.message);
    process.exit(1);
  }
}

const TARGET_DIRS = [
  path.join(rootDir, "apps", "admin", "public", "brand"),
  path.join(rootDir, "apps", "admin", "public", "site"),
  path.join(rootDir, "apps", "marketing", "public", "brand"),
  path.join(rootDir, "apps", "marketing", "public", "site"),
  path.join(rootDir, "apps", "marketing", "public", "logos"),
  path.join(rootDir, "apps", "lms", "public", "brand"),
];

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

async function convertFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg"].includes(ext)) {
    return null;
  }

  const baseName = path.basename(filePath, ext);
  const dirName = path.dirname(filePath);
  const originalStats = fs.statSync(filePath);
  const originalSize = originalStats.size;

  const webpPath = path.join(dirName, `${baseName}.webp`);
  const avifPath = path.join(dirName, `${baseName}.avif`);

  const results = {
    file: path.relative(rootDir, filePath),
    originalSize,
    webpSize: 0,
    avifSize: 0,
    webpSaved: 0,
    avifSaved: 0,
  };

  try {
    // Generate WebP
    await sharp(filePath)
      .webp({ quality: 80, effort: 6 })
      .toFile(webpPath);
    results.webpSize = fs.statSync(webpPath).size;
    results.webpSaved = originalSize - results.webpSize;

    // Generate AVIF
    await sharp(filePath)
      .avif({ quality: 75, effort: 6 })
      .toFile(avifPath);
    results.avifSize = fs.statSync(avifPath).size;
    results.avifSaved = originalSize - results.avifSize;

    return results;
  } catch (err) {
    console.error(`Error converting ${filePath}:`, err.message);
    return null;
  }
}

async function run() {
  console.log("=================================================");
  console.log("   Asset Optimization & Next-Gen Conversion      ");
  console.log("=================================================\n");

  let totalOriginal = 0;
  let totalWebp = 0;
  let totalAvif = 0;
  let count = 0;

  for (const dir of TARGET_DIRS) {
    if (!fs.existsSync(dir)) continue;

    console.log(`Scanning: ${path.relative(rootDir, dir)}`);
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) continue;

      const res = await convertFile(fullPath);
      if (res) {
        count++;
        totalOriginal += res.originalSize;
        totalWebp += res.webpSize;
        totalAvif += res.avifSize;

        const webpPct = ((res.webpSaved / res.originalSize) * 100).toFixed(1);
        const avifPct = ((res.avifSaved / res.originalSize) * 100).toFixed(1);

        console.log(
          `  -> ${path.basename(res.file)} (${formatBytes(res.originalSize)}) ` +
          `=> WebP: ${formatBytes(res.webpSize)} (-${webpPct}%) | ` +
          `AVIF: ${formatBytes(res.avifSize)} (-${avifPct}%)`
        );
      }
    }
  }

  const totalWebpSaved = totalOriginal - totalWebp;
  const totalAvifSaved = totalOriginal - totalAvif;

  console.log("\n=================================================");
  console.log(`Converted ${count} assets successfully.`);
  console.log(`Total Original Size: ${formatBytes(totalOriginal)}`);
  console.log(`Total WebP Size:     ${formatBytes(totalWebp)} (Saved ${formatBytes(totalWebpSaved)}, -${((totalWebpSaved / totalOriginal) * 100).toFixed(1)}%)`);
  console.log(`Total AVIF Size:     ${formatBytes(totalAvif)} (Saved ${formatBytes(totalAvifSaved)}, -${((totalAvifSaved / totalOriginal) * 100).toFixed(1)}%)`);
  console.log("=================================================");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
