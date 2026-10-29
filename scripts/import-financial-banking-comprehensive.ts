import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";

const DIR = join(process.cwd(), "database", "data", "Bank", "Financial & Banking Knowledge");
const FILES = [
  "Questions(Payment Systems and Digital Banking).txt",
  "Questions(Commercial Banking and Operations).txt",
  "Questions(Bangladesh Bank Monetary Policy & Central Banking ).txt",
  "Questions(Bangladesh Banking System and Institutions).txt",
  "Questions(Bangladesh Bank & Banking Laws).txt",
  "Questions(All Banking Terms, Full Forms & Monetary Policy Rates).txt",
];

function parseQuestionBlock(
  lines: string[],
  startIndex: number,
  fileName: string,
): {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  nextIndex: number;
  questionNumber: number;
} | null {
  if (startIndex >= lines.length) return null;
  
  const firstLine = lines[startIndex];
  const questionMatch = firstLine.match(/^[0-9]+\.\s*(.+)$/);
  if (!questionMatch) return null;
  
  const question = questionMatch[1];
  const questionNumber = parseInt(firstLine.split('.')[0]);
  let currentIndex = startIndex + 1;
  
  // Format detection and parsing
  let options: string[] = [];
  let format = 0; // 0=unknown, 1=separate lines, 2=single line
  
  // Check next few lines for format detection
  if (currentIndex < lines.length) {
    const nextLine = lines[currentIndex];
    
    // Check if next line contains A.-D. pattern on separate lines
    const separateLines = [];
    for (let i = 0; i < 4 && currentIndex + i < lines.length; i++) {
      const line = lines[currentIndex + i];
      const match = line.match(/^[A-D]\.\s*(.+)$/);
      if (!match) break;
      separateLines.push(match[1]);
    }
    
    if (separateLines.length === 4) {
      // Format 1: Options on separate lines
      format = 1;
      options = separateLines;
      currentIndex += 4;
    } else if (nextLine.match(/^[A-D]\.\s*[A-D]\.\s*[A-D]\.\s*[A-D]\.\s*./)) {
      // Format 2: All options on one line - handle this specific format
      format = 2;
      const optionLine = nextLine;
      
      // More robust parsing for the single-line format
      const optionMatches = Array.from(optionLine.matchAll(/([A-D])\.\s*(.+?)(?=\s*[A-D]\.|\s*Correct Answer|\s*Explanation|\s*$)/g));
      if (optionMatches.length === 4) {
        // Sort by letter order to ensure A,B,C,D
        optionMatches.sort((a, b) => a[1].localeCompare(b[1]));
        options = optionMatches.map(m => m[2]);
        currentIndex++;
      } else {
        return null;
      }
    } else if (nextLine.includes("A.") && nextLine.includes("B.") && nextLine.includes("C.") && nextLine.includes("D.")) {
      // Format 2 variation: handle lines with multiple options but not perfect pattern
      format = 2;
      const optionLine = nextLine;
      
      // Try to split by option markers more carefully
      const optionChunks = optionLine.split(/([A-D]\.\s*)/);
      const optionMatches = [];
      for (let i = 1; i < optionChunks.length; i += 2) {
        if (i + 1 < optionChunks.length) {
          optionMatches.push({
            letter: optionChunks[i].trim().charAt(0),
            text: optionChunks[i + 1].trim(),
          });
        }
      }
      
      if (optionMatches.length === 4) {
        optionMatches.sort((a, b) => a.letter.localeCompare(b.letter));
        options = optionMatches.map(m => m.text);
        currentIndex++;
      } else {
        return null;
      }
    } else {
      // Try generic parsing for both formats
      format = 0;
    }
  }
  
  if (format === 0) {
    // Generic format detection - try both approaches
    let foundOptions: string[] = [];
    
    // First, try to find options on separate lines
    for (let i = currentIndex; i < Math.min(currentIndex + 10, lines.length); i++) {
      const line = lines[i];
      const match = line.match(/^[A-D]\.\s*(.+)$/);
      if (match) {
        foundOptions.push(match[1]);
      } else if (foundOptions.length === 4) {
        // We have 4 separate option lines
        format = 1;
        options = foundOptions;
        currentIndex = i;
        break;
      } else if (foundOptions.length > 0 && !match) {
        // Options were found but something else broke the pattern
        break;
      }
    }
    
    // If not found separate lines, try single line format
    if (format !== 1) {
      const lookAheadText = lines.slice(currentIndex, Math.min(currentIndex + 5, lines.length)).join(" ");
      const optionMatches = Array.from(lookAheadText.matchAll(/([A-D])\.\s*(.+?)(?=\s*[A-D]\.|\s*Correct Answer|\s*Explanation|\s*$)/g));
      if (optionMatches.length >= 4) {
        format = 2;
        optionMatches.sort((a, b) => a[1].localeCompare(b[1]));
        options = optionMatches.slice(0, 4).map(m => m[2]);
        currentIndex += Math.ceil((optionMatches[3].index! - optionMatches[0].index!) / 50);
      } else {
        return null;
      }
    }
  }
  
  // Parse Correct Answer line
  if (currentIndex >= lines.length) return null;
  const answerLine = lines[currentIndex];
  const answerMatch = answerLine.match(/Correct Answer\s*:/i);
  if (!answerMatch) return null;
  
  const answerPart = answerLine.slice(answerMatch.index! + answerMatch[0].length).trim();
  const letterMatch = answerPart.match(/^([A-D])\.\s*(.+)$/);
  if (!letterMatch) return null;
  
  const letter = letterMatch[1];
  const answerText = letterMatch[2];
  const optionIndex = ["A", "B", "C", "D"].indexOf(letter);
  if (optionIndex === -1 || optionIndex >= options.length) return null;
  
  const correctAnswer = options[optionIndex];
  currentIndex++;
  
  // Parse Explanation line
  if (currentIndex >= lines.length) return null;
  const explanationLine = lines[currentIndex];
  const explanationMatch = explanationLine.match(/Explanation\s*:/i);
  if (!explanationMatch) return null;
  
  let explanation = explanationLine.slice(explanationMatch.index! + explanationMatch[0].length).trim();
  currentIndex++;
  
  // Handle multi-line explanations
  while (currentIndex < lines.length && !lines[currentIndex].match(/^[0-9]+\.\s/)) {
    const nextLine = lines[currentIndex].trim();
    if (!nextLine) {
      currentIndex++;
      continue;
    }
    // Stop if we encounter another question
    if (nextLine.match(/^[0-9]+\.\s/)) {
      break;
    }
    // Stop if it looks like an option (A.-D.)
    if (nextLine.match(/^[A-D]\.\s/)) {
      break;
    }
    // Stop if it looks like a Correct Answer line
    if (nextLine.match(/Correct Answer\s*:/i)) {
      break;
    }
    // Add to explanation
    explanation += " " + nextLine;
    currentIndex++;
  }
  
  return {
    question,
    options,
    correctAnswer,
    explanation,
    nextIndex: currentIndex,
    questionNumber: isNaN(questionNumber) ? currentIndex : questionNumber,
  };
}

async function main() {
  const dryRun = !process.argv.includes("--yes");
  const prisma = new PrismaClient();
  
  try {
    // Verify ecosystem exists
    const bankEco = await prisma.examEcosystem.findUnique({
      where: { code: "BANGLADESH_BANK" },
    });
    if (!bankEco) throw new Error("BANGLADESH_BANK ecosystem not found");
    
    // Find or create Financial & Banking Knowledge subject
    let subject = await prisma.subject.findFirst({
      where: {
        ecosystemId: bankEco.id,
        nameEn: "Financial & Banking Knowledge",
        nameBn: "আর্থিক ও ব্যাংকিং জ্ঞান",
      },
    });
    
    if (!subject) {
      console.log("Creating Financial & Banking Knowledge subject...");
      subject = await prisma.subject.create({
        data: {
          ecosystemId: bankEco.id,
          nameEn: "Financial & Banking Knowledge",
          nameBn: "আর্থিক ও ব্যাংকিং জ্ঞান",
          icon: "🏦",
          color: "text-purple-400",
          bg: "bg-purple-500/10",
          sortOrder: 7,
        },
      });
    }
    
    // Check existing questions to avoid duplicates
    const existingQuestions = await prisma.question.findMany({
      where: { subjectId: subject.id },
      select: { sourceKey: true, question: true, options: true, correctAnswer: true, explanation: true },
    });
    
    // Create a map for faster duplicate checking
    const existingMap = new Map<string, any>();
    for (const q of existingQuestions) {
      existingMap.set(q.sourceKey, q);
      // Also map by question signature for backup deduplication
      const sig = mcaSignature({
        question: q.question,
        options: q.options as string[],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      });
      existingMap.set(`sig_${sig}`, q);
    }
    
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let rejected = 0;
    let totalQuestionsParsed = 0;
    
    // Process each file
    for (const file of FILES) {
      const text = readFileSync(join(DIR, file), "utf8").replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
      
      console.log(`\nProcessing ${file} (${lines.length} lines)...`);
      
      let currentQuestionNumber = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip header lines and section separators
        if (!line.trim() || 
            line.match(/Questions\s*[0-9]+–[0-9]+:/i) ||
            line.match(/Section\s*[A-Z]:/i) ||
            line.match(/^[A-Z]\s*:.*/i) ||
            line.match(/^[IVX]+\s*:.*/i) ||
            line.includes("Questions 26–45:") ||
            line.includes("Questions 46–65:") ||
            line.includes("Section B:") ||
            line.match(/^[0-9]+–[0-9]+:/)) {
          continue;
        }
        
        // Try to parse as a question block
        const block = parseQuestionBlock(lines, i, file);
        if (!block) {
          // Debug: show line that failed parsing
          if (line.trim() && (line.includes("A.") || line.includes("B.") || line.includes("C.") || line.includes("D."))) {
            console.warn(`  [debug] Could not parse line: ${line.substring(0, 100)}...`);
          }
          continue;
        }
        
        currentQuestionNumber++;
        totalQuestionsParsed++;
        
        // Create source key for deduplication
        const sourceKeyValue = sourceKey(subject.id, "Financial & Banking Knowledge", `${file}:${block.question}`);
        
        // Check if already exists (by sourceKey)
        const existing = existingMap.get(sourceKeyValue);
        if (existing) {
          // If an identical record already exists, skip it
          const currentSig = mcaSignature({
            question: block.question,
            options: block.options,
            correctAnswer: block.correctAnswer,
            explanation: block.explanation,
          });
          const existingSig = existingMap.get(`sig_${currentSig}`);
          if (existingSig) {
            skipped++;
            i = block.nextIndex - 1;
            continue;
          }
          // For differing content, we will treat it as a new version (insert) to avoid complex updates
          // Mark as inserted and proceed
        }
        
        // Check against global signature for cross-file duplicates
        const sig = mcaSignature({
          question: block.question,
          options: block.options,
          correctAnswer: block.correctAnswer,
          explanation: block.explanation,
        });
        
        if (existingMap.has(`sig_${sig}`)) {
          skipped++;
          i = block.nextIndex - 1;
          continue;
        }
        
        // Pass through the import gate
        const gate = scanMca({
          question: block.question,
          options: block.options,
          correctAnswer: block.correctAnswer,
          explanation: block.explanation,
        });
        
        if (gate.verdict === "REJECT") {
          rejected++;
          console.warn(`  [reject] ${file} Q${currentQuestionNumber}: ${gate.fatal.map(f => `${f.code}@${f.field}`).join(",")}`);
          i = block.nextIndex - 1;
          continue;
        }
        
        // Valid new question
        const gateData = {
          question: gate.normalized.question,
          options: gate.normalized.options,
          correctAnswer: gate.normalized.correctAnswer ?? "",
          explanation: gate.normalized.explanation,
        };
        
        // Skip if this sourceKey already exists (duplicate question)
        if (existingMap.has(sourceKeyValue)) {
          skipped++;
          i = block.nextIndex - 1;
          continue;
        }
        
        inserted++;
        existingMap.set(sourceKeyValue, { ...block, ...gateData });
        existingMap.set(`sig_${mcaSignature(gateData)}`, { ...block, ...gateData });
        
        if (!dryRun) {
          await prisma.question.create({
            data: {
              ecosystemId: bankEco.id,
              subjectId: subject.id,
              sourceKey: sourceKeyValue,
              path: "Financial & Banking Knowledge",
              topic: "Financial & Banking Knowledge",
              subtopic: file,
              question: gateData.question,
              options: gateData.options,
              correctAnswer: gateData.correctAnswer,
              explanation: gateData.explanation,
              difficulty: "MEDIUM",
              sourceExam: `Bangla Grammar · ${file}`,
              year: null,
              questionType: "SINGLE_CHOICE",
            },
          });
        }
        
        i = block.nextIndex - 1;
      }
      
      console.log(`✓ ${file}: parsed ${currentQuestionNumber} questions`);
    }
    
    if (!dryRun) {
      console.log("\n" + "=".repeat(60));
      console.log("IMPORT COMPLETED SUCCESSFULLY!");
      console.log("=" + "-".repeat(58));
      console.log(`Total questions parsed: ${totalQuestionsParsed}`);
      console.log(`Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}, Rejected: ${rejected}`);
      console.log("=" + "=".repeat(58));
    } else {
      console.log("\nDRY RUN COMPLETED. Use --yes to apply changes.");
      console.log(`Total questions parsed: ${totalQuestionsParsed}`);
      console.log(`Would insert: ${inserted}, update: ${updated}, skip: ${skipped}, reject: ${rejected}`);
    }
    
  } catch (error) {
    console.error("Import failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});