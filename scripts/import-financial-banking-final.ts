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

/**
 * Parse a question block from file lines.
 * All files follow the same format:
 * 1. Question line: "N. [question text]"
 * 2-5. Option lines: "A. [option text]", "B. [option text]", "C. [option text]", "D. [option text]"
 * 6. Correct Answer line: "Correct Answer: X. [answer text]"
 * 7. Explanation line: "Explanation: [explanation text]"
 * 
 * Headers like "Questions 1–25: ..." or "Section 1: ..." should be skipped.
 */
function parseQuestionBlock(
  lines: string[],
  startIndex: number,
): {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  nextIndex: number;
} | null {
  if (startIndex >= lines.length) return null;
  
  const firstLine = lines[startIndex];
  const questionMatch = firstLine.match(/^[0-9]+\.\s*(.+)$/);
  if (!questionMatch) return null;
  
  const question = questionMatch[1];
  let currentIndex = startIndex + 1;
  
  // Parse options (A-D lines)
  const options: string[] = [];
  for (let i = 0; i < 4; i++) {
    if (currentIndex >= lines.length) return null;
    const optionLine = lines[currentIndex];
    const optionMatch = optionLine.match(/^[A-D]\.\s*(.+)$/);
    if (!optionMatch) return null;
    options.push(optionMatch[1]);
    currentIndex++;
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
    if (nextLine) {
      // Stop if we encounter another question (starts with number + period)
      if (nextLine.match(/^[0-9]+\.\s/)) {
        break;
      }
      // Continue adding to explanation if it doesn't look like an option
      if (!nextLine.match(/^[A-D]\.\s/)) {
        explanation += " " + nextLine;
        currentIndex++;
      } else {
        break;
      }
    } else {
      currentIndex++;
    }
  }
  
  return {
    question,
    options,
    correctAnswer,
    explanation,
    nextIndex: currentIndex,
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
        nameBn: "06_Financial & Banking Knowledge",
      },
    });
    
    if (!subject) {
      console.log("Creating Financial & Banking Knowledge subject...");
      subject = await prisma.subject.create({
        data: {
          ecosystemId: bankEco.id,
          nameEn: "Financial & Banking Knowledge",
          nameBn: "06_Financial & Banking Knowledge",
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
        
        // Skip header lines
        if (!line.trim() || 
            line.match(/Questions\s*[0-9]+–[0-9]+:/i) ||
            line.match(/^[A-Z]\s*:.*/i) ||
            line.match(/Section\s*[0-9]+:/i) ||
            line.match(/^[A-Z][a-z]+\s*[0-9]+:/i)) {
          continue;
        }
        
        // Try to parse as a question block
        const block = parseQuestionBlock(lines, i);
        if (!block) {
          continue;
        }
        
        currentQuestionNumber++;
        totalQuestionsParsed++;
        
        // Create source key for deduplication
        const sourceKeyValue = sourceKey(subject.id, "Financial & Banking Knowledge", block.question);
        
        // Check if already exists
        const existing = existingMap.get(sourceKeyValue);
        if (existing) {
          // Check if content is identical
          const currentSig = mcaSignature({
            question: block.question,
            options: block.options,
            correctAnswer: block.correctAnswer,
            explanation: block.explanation,
          });
          
          const existingSig = existingMap.get(`sig_${currentSig}`);
          if (existingSig) {
            skipped++;
            continue;
          } else {
            // Content differs, update
            updated++;
            existingMap.set(sourceKeyValue, { ...existing, ...block });
            existingMap.set(`sig_${currentSig}`, existing);
            if (!dryRun) {
              await prisma.question.update({
                where: { id: existing.id },
                data: {
                  question: block.question,
                  options: block.options,
                  correctAnswer: block.correctAnswer,
                  explanation: block.explanation,
                  updatedAt: new Date(),
                },
              });
            }
            i = block.nextIndex - 1;
            continue;
          }
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
      console.log("\nImport completed successfully!");
      console.log(`Total questions parsed: ${totalQuestionsParsed}`);
      console.log(`Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}, Rejected: ${rejected}`);
    } else {
      console.log("\nDry run completed. Use --yes to apply changes.");
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