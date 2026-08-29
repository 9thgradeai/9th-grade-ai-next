import { PrismaClient } from "@prisma/client";
import PDF from "pdf-parse";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

interface BcsQuestion {
  term: string; // e.g., "50th"
  questionText: string;
  subject: string;
}

function cleanText(text: string): string {
  return text
    .replace(/[\u0300-\u036f]/g, "") // Remove combining diacritical marks
    .replace(/\s+/g, " ")
    .replace(/[LJ]/g, "")
    .replace(/Dz/g, "")
    .trim();
}

async function matchAndUpdate() {
  console.log("Reading PDF...");
  const dataBuffer = readFileSync("database/data/question_bank/bcs/bcs-exam-wise-demo.pdf");
  const data = await PDF(dataBuffer);
  const pdfText = data.text;
  
  // The PDF uses broken encoding: 
  // ৫০তমবিসিএস -> ৫০তম + িবিসএস
  // We need to find term sections by looking for patterns like "৫০তম", "৪৯তম", etc.
  
  // Find all term markers (Bengali numerals + তম)
  const termPattern = /([০-৯]{1,2})তম/g;
  const termMatches = [...pdfText.matchAll(termPattern)];
  
  console.log("Term matches:", termMatches.length);
  
  // Extract unique terms
  const terms = new Set<string>();
  for (const match of termMatches) {
    const num = match[1];
    // Convert Bengali numerals to Arabic
    const arabic = bengaliToArabic(num);
    if (parseInt(arabic) >= 10 && parseInt(arabic) <= 50) {
      terms.add(arabic);
    }
  }
  
  console.log("Found terms:", Array.from(terms).sort((a, b) => parseInt(b) - parseInt(a)));
  
  // Now find section boundaries for each term
  const termSections: { term: string; start: number; end: number }[] = [];
  
  // Look for patterns like "৫০তমবিসিএস" or "৫০তম বিসিএস" (with broken encoding)
  const sectionPattern = /([০-৯]{1,2})তম[^\d]*বিসিএস/gi;
  // Actually, the text has "৫০তমবিসিএস" as "৫০তম" followed by "িবিসএস"
  
  // Better approach: find all occurrences of "তম" followed by "বিসিএস" or similar
  const sectionMatches = [...pdfText.matchAll(/([০-৯]{1,2})তম[^\d]*?(?:বিসিএস|িবিসএস|বি সি এস)/gi)];
  
  console.log("Section matches:", sectionMatches.length);
  
  for (const match of sectionMatches) {
    const bengaliNum = match[1];
    const arabic = bengaliToArabic(bengaliNum);
    const term = parseInt(arabic);
    if (term >= 10 && term <= 50) {
      termSections.push({
        term: `${term}th`,
        start: match.index!,
        end: 0 // will fill in next
      });
    }
  }
  
  // Sort by position
  termSections.sort((a, b) => a.start - b.start);
  
  // Set end positions
  for (let i = 0; i < termSections.length; i++) {
    if (i + 1 < termSections.length) {
      termSections[i].end = termSections[i + 1].start;
    } else {
      termSections[i].end = pdfText.length;
    }
  }
  
  console.log("Term sections:", termSections.map(s => `${s.term}: ${s.start}-${s.end}`));
  
  // Now extract questions from each term section
  const bcsQuestions: BcsQuestion[] = [];
  
  for (const section of termSections) {
    const sectionText = pdfText.substring(section.start, section.end);
    const sectionQuestions = parseQuestionsFromSection(sectionText, section.term);
    console.log(`Term ${section.term}: ${sectionQuestions.length} questions`);
    bcsQuestions.push(...sectionQuestions);
  }
  
  console.log(`Total extracted: ${bcsQuestions.length} questions`);
  
  // Group by term
  const byTerm: Record<string, number> = {};
  for (const q of bcsQuestions) {
    byTerm[q.term] = (byTerm[q.term] || 0) + 1;
  }
  console.log("Questions per term:", byTerm);
  
  // Now match with database questions
  console.log("Fetching database questions...");
  const dbQuestions = await prisma.question.findMany({
    where: { sourceExam: "BCS" },
    select: { id: true, question: true, subject: { select: { nameBn: true } }, bcsTerm: true }
  });
  console.log(`Found ${dbQuestions.length} BCS questions in database`);
  
  // Build lookup for database questions
  const dbBySubject: Record<string, Map<string, number>> = {};
  for (const q of dbQuestions) {
    const subjectName = q.subject.nameBn;
    if (!dbBySubject[subjectName]) dbBySubject[subjectName] = new Map();
    const key = cleanText(q.question).substring(0, 100);
    dbBySubject[subjectName].set(key, q.id);
  }
  
  // Match and update
  let updated = 0;
  let notFound = 0;
  
  for (const bcsQ of bcsQuestions) {
    const subjectMap = dbBySubject[bcsQ.subject];
    if (!subjectMap) continue;
    
    const key = cleanText(bcsQ.questionText).substring(0, 100);
    const dbId = subjectMap.get(key);
    
    if (dbId) {
      await prisma.question.update({
        where: { id: dbId },
        data: { bcsTerm: bcsQ.term }
      });
      updated++;
    } else {
      notFound++;
    }
  }
  
  console.log(`Updated: ${updated}, Not found: ${notFound}`);
  
  // Show remaining questions without BCS term
  const withoutTerm = await prisma.question.count({
    where: { sourceExam: "BCS", bcsTerm: null }
  });
  console.log(`Questions without BCS term: ${withoutTerm}`);
}

function bengaliToArabic(bengali: string): string {
  const map: Record<string, string> = {
    "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
    "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9"
  };
  return bengali.split("").map(c => map[c] || c).join("");
}

function parseQuestionsFromSection(text: string, term: string): BcsQuestion[] {
  const questions: BcsQuestion[] = [];
  
  // Find subject headers - look for known subject patterns
  const subjectPatterns = [
    { pattern: /বাংলাভাষাওসাহিত্য|বাংলা ভাষা ও সািহতয্|বাংলা ভাষা ও সাহিত্য/gi, subject: "বাংলা ভাষা ও সাহিত্য" },
    { pattern: /English Language and Literature/gi, subject: "English Language and Literature" },
    { pattern: /বাংলাদেশবিষয়াবলি|বাংলাদেশ বিষয়াবলি/gi, subject: "বাংলাদেশ বিষয়াবলি" },
    { pattern: /আন্তর্জাতিকবিষয়াবলি|আন্তর্জাতিক বিষয়াবলী/gi, subject: "আন্তর্জাতিক বিষয়াবলী" },
    { pattern: /ভূগোলপরিবেশওদুর্যোগব্যবস্থাপনা|ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা/gi, subject: "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা" },
    { pattern: /সাধারণবিজ্ঞান|সাধারণ বিজ্ঞান/gi, subject: "সাধারণ বিজ্ঞান" },
    { pattern: /কম্পিউটারওতথ্যপ্রযুক্তি|কম্পিউটার ও তথ্য প্রযুক্তি/gi, subject: "কম্পিউটার ও তথ্য প্রযুক্তি" },
    { pattern: /গাণিতিকযুক্তি|গাণিতিক যুক্তি/gi, subject: "গাণিতিক যুক্তি" },
    { pattern: /মানসিকদক্ষতা|মানসিক দক্ষতা/gi, subject: "মানসিক দক্ষতা" },
    { pattern: /নৈতিকতামূল্যবোধওসুশাসন|নৈতিকতা, মূল্যবোধ ও সু-শাসন|নৈতিকতা, মূল্যবোধ ও সুশাসন/gi, subject: "নৈতিকতা, মূল্যবোধ ও সু-শাসন" },
  ];
  
  // Find all subject positions
  const subjectPositions: { subject: string; index: number }[] = [];
  
  for (const { pattern, subject } of subjectPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      subjectPositions.push({ subject, index: match.index! });
    }
  }
  
  // Sort by position
  subjectPositions.sort((a, b) => a.index - b.index);
  
  // Extract questions for each subject
  for (let i = 0; i < subjectPositions.length; i++) {
    const { subject } = subjectPositions[i];
    const start = subjectPositions[i].index;
    const end = i + 1 < subjectPositions.length ? subjectPositions[i + 1].index : text.length;
    const subjectText = text.substring(start, end);
    
    const subjectQuestions = parseSubjectQuestions(subjectText, term, subject);
    questions.push(...subjectQuestions);
  }
  
  return questions;
}

function parseSubjectQuestions(text: string, term: string, subject: string): BcsQuestion[] {
  const questions: BcsQuestion[] = [];
  
  // Find question numbers (Bengali or English numerals followed by . or ।)
  // Pattern: digits + . or । + question text until next question or answer/explanation
  const questionPattern = /([০-৯0-9]+)[.\।]\s*([\s\S]*?)(?=\n[০-৯0-9]+[.\।]|$)/g;
  
  let match;
  while ((match = questionPattern.exec(text)) !== null) {
    const questionNum = match[1];
    const questionText = match[2].trim();
    
    // Split question from options/answer/explanation
    const cleanQuestion = questionText.split(/উত্তর:|ব্যাখ্যা:/)[0].trim();
    
    if (cleanQuestion.length > 15) { // Filter out noise
      questions.push({
        term,
        questionText: cleanText(cleanQuestion),
        subject,
      });
    }
  }
  
  return questions;
}

async function main() {
  try {
    await matchAndUpdate();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);