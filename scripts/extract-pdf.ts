import PDF from "pdf-parse";
import { readFileSync, writeFileSync } from "fs";

async function main() {
  const dataBuffer = readFileSync("database/data/question_bank/bcs/bcs-exam-wise-demo.pdf");
  const data = await PDF(dataBuffer);
  writeFileSync("pdf-output.txt", data.text);
  console.log("Done, length:", data.text.length);
  console.log("Pages:", data.numpages);
}

main().catch(console.error);