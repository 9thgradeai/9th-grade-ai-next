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
 * Parse a single line question block.
 * Supports both:
 * Format 1: Question on line 1, A-D on separate lines (Payment Systems)
 * Format 2: Question, A-D all on one line with \\r\\n (Other files)
 */
function parseQuestionBlock(
  lines: string[],
  startIndex: number,
): {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  explanationEndIndex: number;
} | null {
  if (startIndex >= lines.length) return null;
  
  const firstLine = lines[startIndex].trim();
  const questionMatch = firstLine.match(/^[0-9]+\.\s*(.+)$/);
  if (!questionMatch) return null;
  
  const question = questionMatch[1];
  let currentIndex = startIndex + 1;
  
  // Format detection
  const linesAfterQuestion = lines.slice(currentIndex);
  
  // Check if options are on separate lines (Format 1)
  const optionLines = linesAfterQuestion.slice(0, 5).filter(l => l.trim() && /^[A-D]\.\s/.test(l.trim()));
  let options: string[] = [];
  let format1 = false;
  
  if (optionLines.length === 4) {
    // Format 1: Options on separate lines
    format1 = true;
    for (let i = 0; i < 4; i++) {
      const optionMatch = linesAfterQuestion[currentIndex + i]?.trim().match(/^[A-D]\.\s*(.+)$/);
      if (!optionMatch) return null;
      options.push(optionMatch[1]);
    }
    currentIndex += 4;
  } else {
    // Format 2: All options on one line with \\r\\n
    const combinedLine = linesAfterQuestion[0] || "";
    const optionMatches = combinedLine.matchAll(/([A-D])\.\s*([^\\r\\n]*)/g);
    const optionMatchesArray = Array.from(optionMatches);
    if (optionMatchesArray.length !== 4) return null;
    
    // Sort by letter to ensure A,B,C,D order
    optionMatchesArray.sort((a, b) => a[1].localeCompare(b[1]));
    options = optionMatchesArray.map(m => m[2]);
    currentIndex += 1;
  }
  
  // Find Correct Answer line
  let correctAnswer = "";
  let answerLineIndex = -1;
  for (let i = currentIndex; i < Math.min(currentIndex + 10, lines.length); i++) {
    const line = lines[i];
    const answerMatch = line.match(/Correct Answer\s*:/i);
    if (answerMatch) {
      const answerPart = line.slice(answerMatch.index! + answerMatch[0].length).trim();
      const letterMatch = answerPart.match(/^([A-D])\.\s*(.+)$/);
      if (letterMatch) {
        const letter = letterMatch[1];
        const answerText = letterMatch[2];
        const optionIndex = ["A", "B", "C", "D"].indexOf(letter);
        if (optionIndex !== -1 && optionIndex < options.length) {
          correctAnswer = options[optionIndex];
          answerLineIndex = i;
          currentIndex = i + 1;
          break;
        }
      }
      // Handle format where answer includes the text
      const textMatch = answerPart.match(/^([ABCD])\.\s*(.+)$/);
      if (textMatch) {
        correctAnswer = textMatch[2];
        answerLineIndex = i;
        currentIndex = i + 1;
        break;
      }
    }
  }
  
  if (!correctAnswer) return null;
  
  // Find Explanation line
  let explanation = "";
  for (let i = currentIndex; i < Math.min(currentIndex + 20, lines.length); i++) {
    const line = lines[i].trim();
    if (line.toLowerCase().startsWith("explanation:")) {
      explanation = line.slice(11).trim();
      currentIndex = i + 1;
      // If explanation is short and there's more content, continue reading multi-line explanation
      if (explanation && !explanation.endsWith(".")) {
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine && !nextLine.match(/^[0-9]+\.$/)) {
            explanation += " " + nextLine;
            currentIndex = j + 1;
          } else {
            break;
          }
        }
      }
      break;
    }
  }
  
  return {
    question,
    options,
    correctAnswer,
    explanation,
    explanationEndIndex: currentIndex,
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
    
    // Verify we have a topic to place questions under
    const rootTopic = await prisma.topic.findFirst({
      where: { subjectId: subject.id, depth: 0, path: "06_Financial_Knowledge" },
    });
    
    if (!rootTopic) {
      console.log("Creating root Financial Knowledge topic...");
      const created = await prisma.topic.create({
        data: {
          subjectId: subject.id,
          name: "06_Financial_Knowledge",
          slug: "06_financial_knowledge",
          path: "06_Financial_Knowledge",
          depth: 0,
          sortOrder: 6,
        },
      });
      // We need the topicId for later, store it for now
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
    
    // Process each file
    for (const file of FILES) {
      const text = readFileSync(join(DIR, file), "utf8").replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
      
      // Extract header if present
      let currentQuestionNumber = 0;
      
      console.log(`\nProcessing ${file}...`);
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip header lines
        if (!line.trim() || line.includes("Questions") || line.includes("Questions")) {
          if (line.match(/^[0-9]+\.\s/)) {
            // This is a question line
            const block = parseQuestionBlock(lines, i);
            if (!block) {
              skipped++;
              continue;
            }
            
            currentQuestionNumber++;
            
            // Validate the block
            if (!block.question || block.options.length !== 4 || !block.correctAnswer) {
              rejected++;
              console.warn(`  [reject] ${file} Q${currentQuestionNumber}: invalid structure`);
              continue;
            }
            
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
            
            // Skip ahead in lines based on parsed block length
            i = block.explanationEndIndex - 1;
          }
          continue;
        }
      }
      
      console.log(`✓ ${file}: processed`);
    }
    
    if (!dryRun) {
      console.log("\nImport completed successfully!");
      console.log(`Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}, Rejected: ${rejected}`);
    } else {
      console.log("\nDry run completed. Use --yes to apply changes.");
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