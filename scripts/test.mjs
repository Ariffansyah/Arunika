#!/usr/bin/env node
/**
 * Arunika Test Suite Runner
 *
 * Menjalankan seluruh pengujian unit lintas konfigurasi peta sekolah
 * (Pesisir, Pegunungan, dan Kota) secara konsisten dan lintas platform (Windows/macOS/Linux).
 *
 * Penggunaan:
 *   pnpm test             -> Menjalankan pengujian untuk semua peta
 *   node scripts/test.mjs [pesisir|pegunungan|kota]  -> Menguji peta spesifik
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const testFiles = readdirSync(join(root, "lib"))
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => join("lib", f));

const allMaps = ["pesisir", "pegunungan", "kota"];
const targetArg = process.argv[2]?.toLowerCase();
const maps = targetArg && allMaps.includes(targetArg) ? [targetArg] : allMaps;

console.log("┌──────────────────────────────────────────────────┐");
console.log("│           ARUNIKA TEST SUITE RUNNER              │");
console.log("└──────────────────────────────────────────────────┘");

let hasFailure = false;

for (const map of maps) {
  console.log(`\n▶ Menjalankan pengujian untuk konfigurasi peta: [${map.toUpperCase()}]`);
  const res = spawnSync(process.execPath, ["--test", ...testFiles], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PETA: map },
  });

  if (res.status !== 0) {
    console.error(`\n✖ Gagal pada pengujian peta: ${map}`);
    hasFailure = true;
    break;
  }
}

if (hasFailure) {
  process.exit(1);
} else {
  console.log(`\n✔ Seluruh pengujian (${maps.join(", ")}) berhasil diselesaikan dengan sukses!\n`);
}
