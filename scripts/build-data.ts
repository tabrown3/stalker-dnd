// Usage: npm run data [-- path/to/export.csv]
// Converts the sheet export into data/*.json plus data/validation-report.md.
// Writes nothing if the sheet can't be converted.
import { writeFileSync } from "node:fs";
import { SOURCE_CSV, outputFiles, report, runPipeline } from "../src/data/pipeline.ts";

const csvPath = process.argv[2] ?? SOURCE_CSV;
const { data, issues } = runPipeline(csvPath);

if (!data) {
  console.error(report(issues));
  console.error("Conversion failed; no files written.");
  process.exit(1);
}

for (const [path, contents] of Object.entries(outputFiles(data, issues))) writeFileSync(path, contents);

const count = (s: string) => issues.filter((i) => i.severity === s).length;
console.log(
  `Wrote data/: ${data.weapons.length} weapons, ${data.ammo.length} calibers + ${data.ammoVariants.length} variants, ` +
    `${data.armor.length} armor pieces, ${data.factions.length} factions.`,
);
console.log(`${count("warning")} warnings, ${count("info")} info. See data/validation-report.md.`);
