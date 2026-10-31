import { readFileSync } from "fs";
import { join } from "path";

const DIR = join(process.cwd(), "database", "data", "Bank", "Financial & Banking Knowledge");
const testFile = "Questions(All Banking Terms, Full Forms & Monetary Policy Rates).txt";

const text = readFileSync(join(DIR, testFile), "utf8").replace(/^\uFEFF/, "");
const lines = text.split(/\r?\n/).map((l) => l.trimEnd());

console.log(`Total lines: ${lines.length}`);
console.log("\nFirst 100 lines:")
for (let i = 0; i < Math.min(100, lines.length); i++) {
  const line = lines[i];
  if (line.includes("\\u2022") || line.includes("•")) {
    console.log(`${i + 1}: *** ${JSON.stringify(line)} ***`);
  } else {
    console.log(`${i + 1}: ${JSON.stringify(line)}`);
  }
}

console.log("\n\nLooking for question patterns...")
for (let i = 0; i < Math.min(150, lines.length); i++) {
  const line = lines[i];
  if (line.match(/^[0-9]+\.\s/)) {
    console.log(`\nFound question at line ${i + 1}: ${line.substring(0, 80)}...`);
    
    // Check next few lines
    for (let j = 0; j < 15 && i + j < lines.length; j++) {
      const nextLine = lines[i + j];
      if (nextLine.match(/^[A-D]\.\s/)) {
        console.log(`  Line ${i + j + 1}: ${JSON.stringify(nextLine)}`);
      } else if (nextLine.match(/Correct Answer\s*:/i)) {
        console.log(`  Line ${i + j + 1}: ${JSON.stringify(nextLine)}`);
      } else if (nextLine.match(/Explanation\s*:/i)) {
        console.log(`  Line ${i + j + 1}: ${JSON.stringify(nextLine)}`);
      } else if (nextLine.includes("•")) {
        console.log(`  Line ${i + j + 1}: *** BULLET POINT: ${JSON.stringify(nextLine)} ***`);
      }
    }
  }
}