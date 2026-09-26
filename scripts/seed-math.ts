import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";
import { resolveAnswerToOption } from "./qb-forensics/parse-flat";
import { loadTaxonomy, SUBJECT_META, contentPath } from "./taxonomy";
import type { TaxonomyNode } from "./taxonomy";
const prisma = new PrismaClient();
const MATH_DIR = join(process.cwd(), "database/data/ques/Math");
const SUBJECT_BN="গাণিতিক যুক্তি";
function matchOptionBlock(body:string){ const esc=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); const re=new RegExp(`${esc("ক.")} (.*) ${esc("খ.")} (.*) ${esc("গ.")} (.*) ${esc("ঘ.")} (.*)$`); return body.match(re);}
function stripLeadingNumber(t:string){return t.replace(/^\s*[০-৯0-9]+\s*\.\s*/,"").trim();}
/**
 * Multi-line "প্রশ্ন N. / A.-D. / উত্তর: X / ব্যাখ্যা:" block format (e.g. the
 * বীজগাণিতিক_সূত্রাবলি ও বহুপদী_উৎপাদক file). Returns raw records — the import
 * gate (scanMca) strips the "প্রশ্ন N." scaffold and resolves letter answers.
 */
function parseAlgebraBlocks(raw:string){
  const lines=raw.replace(/^\uFEFF/,"").split(/\r?\n/);
  const blocks:string[][]=[]; let cur:string[]=[];
  const isQ=(l:string)=>/^\s*প্রশ্ন\s*[০-৯0-9]+\s*\./.test(l);
  for(const line of lines){
    if(isQ(line)){ if(cur.length) blocks.push(cur); cur=[line]; }
    else if(cur.length) cur.push(line);
  }
  if(cur.length) blocks.push(cur);
  const out:{question:string;options:string[];answerRaw:string;explanation:string}[]=[];
  for(const b of blocks){
    const qLine=(b[0]??"").trim();
    const opts:string[]=[]; let answerRaw=""; const expl:string[]=[]; let inExpl=false;
    for(const ln of b.slice(1)){
      const t=ln.trim();
      const om=/^([A-D])\.\s*(.*)$/.exec(t);
      if(om && !inExpl && opts.length<4){ opts.push(om[2].trim()); continue; }
      const am=/^উত্তর\s*:\s*(.+)$/.exec(t);
      if(am && !inExpl){ answerRaw=am[1].trim(); continue; }
      if(/^ব্যাখ্যা\s*:?\s*$/.test(t)){ inExpl=true; continue; }
      const em=/^ব্যাখ্যা\s*:\s*(.+)$/.exec(t);
      if(em){ inExpl=true; if(em[1].trim()) expl.push(em[1].trim()); continue; }
      if(inExpl && t) expl.push(t);
    }
    // Always push — structurally short records are REJECTed by the gate
    // with proper counts instead of vanishing silently.
    out.push({question:qLine,options:opts,answerRaw,explanation:expl.join("\n").trim()});
  }
  return out;
}
/**
 * Geometry blocks: same shape as parseAlgebraBlocks, plus "সংশোধিত প্রশ্ন"
 * correction blocks — a সংশোধিত block REPLACES the flawed প্রশ্ন block right
 * before it (the file's own errata; e.g. options missing the answer).
 */
function parseGeometryBlocks(raw:string){
  const lines=raw.replace(/^\uFEFF/,"").split(/\r?\n/);
  const isH=(l:string)=>/^\s*(সংশোধিত প্রশ্ন|প্রশ্ন)\s*[০-৯0-9]*\s*[:.]/.test(l);
  const groups:string[][]=[]; let cur:string[]=[];
  for(const line of lines){
    if(isH(line)){ if(cur.length) groups.push(cur); cur=[line]; }
    else if(cur.length) cur.push(line);
  }
  if(cur.length) groups.push(cur);
  const kept:string[][]=[];
  for(const g of groups){
    if(/^\s*সংশোধিত প্রশ্ন/.test(g[0])) kept.pop();
    kept.push(g);
  }
  const norm=(b:string[])=>b[0].trim().replace(/^\s*সংশোধিত প্রশ্ন\s*[০-৯0-9]*\s*[:.]\s*/,"");
  return kept.map((b)=>{
    const qLine=norm(b);
    const opts:string[]=[]; let answerRaw=""; const expl:string[]=[]; let inExpl=false;
    for(const ln of b.slice(1)){
      const t=ln.trim();
      const om=/^([A-D])\.\s*(.*)$/.exec(t);
      if(om && !inExpl && opts.length<4){ opts.push(om[2].trim()); continue; }
      const am=/^উত্তর\s*:\s*(.+)$/.exec(t);
      if(am && !inExpl){ answerRaw=am[1].trim(); continue; }
      if(/^ব্যাখ্যা\s*:?\s*$/.test(t)){ inExpl=true; continue; }
      const em=/^ব্যাখ্যা\s*:\s*(.+)$/.exec(t);
      if(em){ inExpl=true; if(em[1].trim()) expl.push(em[1].trim()); continue; }
      if(inExpl && t) expl.push(t);
    }
    return {question:qLine,options:opts,answerRaw,explanation:expl.join("\n").trim()};
  });
}
const GEO_LEAVES={
  CIRC:"08_গাণিতিক_যুক্তি/Part_04_জ্যামিতি/বৃত্ত_সংক্রান্ত_উপপাদ্য",
  PYTH:"08_গাণিতিক_যুক্তি/Part_04_জ্যামিতি/পিথাগোরাসের_উপপাদ্য",
  TRI:"08_গাণিতিক_যুক্তি/Part_04_জ্যামিতি/ত্রিভুজ_সংক্রান্ত_উপপাদ্য",
  QUAD:"08_গাণিতিক_যুক্তি/Part_04_জ্যামিতি/চতুর্ভুজ_সংক্রান্ত_উপপাদ্য",
  ANG:"08_গাণিতিক_যুক্তি/Part_04_জ্যামিতি/রেখা_ও_কোণ_সংক্রান্ত_উপপাদ্য",
} as const;
const GEO_KEYS:Record<keyof typeof GEO_LEAVES,string[]>={
  CIRC:["বৃত্ত","জ্যা","ব্যাস","চাপ","স্পর্শক","কেন্দ্র","পরিধি","বৃত্তকলা","বৃত্তাংশ","অর্ধবৃত্ত"],
  PYTH:["পিথাগোরাস","মই","সিঁড়ি","সিঁড়ি","খুঁটি","অতিভুজ","দণ্ডায়মান","দণ্ডায়মান","ট্রিপলেট","স্থানাঙ্ক","সোজাসুজি"],
  TRI:["ত্রিভুজ","সমবাহু","সমদ্বিবাহু","সমকোণী","মধ্যমা","সর্বসম","সদৃশ","লম্বকেন্দ্র","ভরকেন্দ্র","পরিকেন্দ্র","অন্তঃকেন্দ্র","পরিবৃত্ত","অন্তর্বৃত্ত"],
  QUAD:["চতুর্ভুজ","সামান্তরিক","আয়ত","বর্গ","রম্বস","ট্রাপিজি","ঘুড়ি","ঘুড়ি","কর্ণ","ঘনক","ঘনবস্তু","আয়তঘন"],
  ANG:["পূরক","সম্পূরক","সন্নিহিত","বিপ্রতীপ","সমান্তরাল","সমদ্বিখণ্ড","ছেদক","ছেদ","কোণ","ঘড়ি","ঘড়ি","কাঁটা","বহুভুজ","ষড়ভুজ","ষড়ভুজ","পঞ্চভুজ","অন্তঃস্থ","বহিঃস্থ"],
};
/** Keyword-route one geometry MCQ to its Part_04 leaf (topics are intermixed in-file). */
function routeGeometryLeaf(question:string, explanation:string):string{
  const text=question+"\n"+explanation;
  const order:(keyof typeof GEO_LEAVES)[]=["CIRC","PYTH","TRI","QUAD","ANG"];
  let best: string=GEO_LEAVES.ANG; let bestScore=0;
  for(const k of order){
    let s=0; for(const kw of GEO_KEYS[k]) if(text.includes(kw)) s++;
    if(s>bestScore){ bestScore=s; best=GEO_LEAVES[k]; }
  }
  return best;
}
function parseMathLine(rawLine:string){
  let line=rawLine.trim();
  const expIdx=line.indexOf("ব্যাখ্যা:");
  let explanation=""; let body=line;
  if(expIdx>=0){explanation=line.slice(expIdx+"ব্যাখ্যা:".length).trim().replace(/^\|?\s*/,""); body=line.slice(0,expIdx).trim();}
  const m=/(উত্তর\s*:)/i.exec(body);
  let answerRaw=""; let qAndOpts=body;
  if(m){answerRaw=body.slice(m.index!+m[0].length).trim().replace(/^\|?\s*/,"").replace(/\s*\|?\s*$/,"").trim(); answerRaw=answerRaw.replace(/^([কখগঘ])\s*[|।.]\s*$/, "$1").replace(/\s*\|.*$/, "").trim(); qAndOpts=body.slice(0,m.index).trim().replace(/\s*\|?\s*$/,"");}
  qAndOpts=qAndOpts.replace(/\s*\|+\s*$/,"").trim();
  const opt=matchOptionBlock(qAndOpts); if(!opt) return null;
  const questionText=stripLeadingNumber(qAndOpts.slice(0,opt.index));
  const options=[opt[1],opt[2],opt[3],opt[4]].map(s=>s.trim().replace(/\s*\|+\s*$/,"").trim());
  const correctAnswer=(resolveAnswerToOption(answerRaw, options) ?? answerRaw).trim().replace(/\s*\|+\s*$/,"");
  if(!questionText||options.length<2) return null;
  return {question:questionText, options, correctAnswer, explanation};
}
async function main(){
  const taxonomy=loadTaxonomy();
  const subjectNode=taxonomy.children.find(n=>n.name==="08_গাণিতিক_যুক্তি")!;
  const meta=SUBJECT_META.find(m=>m.nameBn===SUBJECT_BN)!;
  const subject=await prisma.subject.upsert({where:{ecosystemId_nameBn:{ecosystemId:1, nameBn:SUBJECT_BN}}, update:{}, create:{ecosystemId:1, nameBn:SUBJECT_BN, nameEn:meta.nameEn, icon:meta.icon, color:meta.color, bg:meta.bg, sortOrder:7}});
  // ensure topics
  const leafIds=new Map<string,number>();
  let order=0;
  const createNode=async(node:TaxonomyNode,parentId:number|null,depth:number)=>{
    const path=contentPath(node);
    const row=await prisma.topic.upsert({where:{subjectId_path:{subjectId:subject.id, path}}, update:{name:node.name}, create:{subjectId:subject.id, name:node.name, slug:node.name, path, depth, sortOrder:order++, parentId, questionCount:"0"}});
    if(node.children.length===0) leafIds.set(path,row.id);
    for(const c of node.children) await createNode(c,row.id,depth+1);
  };
  for(const child of subjectNode.children) await createNode(child,null,1);
  console.log("subject",subject.id);
  const files=readdirSync(MATH_DIR).filter(f=>f.endsWith(".txt")).sort();
  const fileLeafMap:Record<string,string[]>={
    "Questions-(Number System & HCF_LCM)-(9Th-Grade AI).txt":["08_গাণিতিক_যুক্তি/Part_01_পাটিগণিত/বাস্তব_সংখ্যা","08_গাণিতিক_যুক্তি/Part_01_পাটিগণিত/লসাগু_ও_গসাগু"],
    "Questions-(Percentage & Profit_Loss)-(9Th-Grade AI).txt":["08_গাণিতিক_যুক্তি/Part_01_পাটিগণিত/শতকরা","08_গাণিতিক_যুক্তি/Part_01_পাটিগণিত/লাভ_ও_ক্ষতি"],
    "Questions-(Ratio, Age & Partnership)-(9Th-Grade AI).txt":["08_গাণিতিক_যুক্তি/Part_01_পাটিগণিত/অনুপাত_ও_সমানুপাত"],
    "Questions-(Simple & Compound Interest)-(9Th-Grade AI).txt":["08_গাণিতিক_যুক্তি/Part_01_পাটিগণিত/সরল_ও_যৌগিক_মুনাফা"],
    "Questions-(সমান্তর ও গুণোত্তর ধারা (AP & GP))-(9Th-Grade AI).txt":["08_গাণিতিক_যুক্তি/Part_03_সূচক_ও_ধারা/সমান্তর_অনুক্রম_ও_ধারা","08_গাণিতিক_যুক্তি/Part_03_সূচক_ও_ধারা/গুণোত্তর_অনুক্রম_ও_ধারা"],
    "Questions(বীজগাণিতিক_সূত্রাবলি ও বহুপদী_উৎপাদক).txt":["08_গাণিতিক_যুক্তি/Part_02_বীজগণিত/বীজগাণিতিক_সূত্রাবলি","08_গাণিতিক_যুক্তি/Part_02_বীজগণিত/বহুপদী_উৎপাদক"],
    "Questions(সূচক ও লগারিদম)_9Th-Grade AI.txt":["08_গাণিতিক_যুক্তি/Part_03_সূচক_ও_ধারা/সূচক","08_গাণিতিক_যুক্তি/Part_03_সূচক_ও_ধারা/লগারিদম"],
    "Questions(রেখা ও কোণ, ত্রিভুজ, চতুর্ভুজ, পিথাগোরাস এবং বৃত্ত ).txt":["ROUTED"],
  };
  // Multi-line প্রশ্ন/A-D/উত্তর/ব্যাখ্যা block files (vs the legacy single-line কখগঘ format).
  const BLOCK_FILES=new Set([
    "Questions(বীজগাণিতিক_সূত্রাবলি ও বহুপদী_উৎপাদক).txt",
    "Questions(সূচক ও লগারিদম)_9Th-Grade AI.txt",
    "Questions(রেখা ও কোণ, ত্রিভুজ, চতুর্ভুজ, পিথাগোরাস এবং বৃত্ত ).txt",
  ]);
  // HELD — none currently. (The সূচক ও লগারিদম file was held until its
  // formulas were recovered from the .docx; it now seeds normally.)
  const HELD_FILES=new Set<string>([
  ]);
  // For Math import we allow overriding global duplicates — user explicitly wants all 1000 under Math
  const dupSet=new Set<string>();
  let totalAccepted=0, totalRejected=0;
  const rejects:Record<string,number>={};
  const candidates:any[]=[];
  const seenKeys=new Set<string>();
  // preload existing keys for this subject
  const existingQs=await prisma.question.findMany({where:{subjectId:subject.id}, select:{sourceKey:true, question:true}});
  const existingKeys=new Set(existingQs.map(r=>r.sourceKey));
  const existingTexts=new Set(existingQs.map(r=>r.question.normalize("NFC")));
  for(const file of files){
    const raw=readFileSync(join(MATH_DIR,file),"utf8").replace(/^\uFEFF/,"");
    if(HELD_FILES.has(file)){ console.log(`${file}: HELD (formulas missing from source) — skipped`); continue; }
    const leaves=fileLeafMap[file]||["08_গাণিতিক_যুক্তি/Part_01_পাটিগণিত/বাস্তব_সংখ্যা"];
    // Normalize both source formats into parsed records before the gate.
    // Geometry blocks carry সংশোধিত-preference + per-block leaf routing.
    const isGeo = file.startsWith("Questions(রেখা");
    const parsedRecs = isGeo
      ? parseGeometryBlocks(raw).map((p)=>({question:p.question, options:p.options, correctAnswer:(resolveAnswerToOption(p.answerRaw, p.options) ?? p.answerRaw).trim(), explanation:p.explanation}))
      : BLOCK_FILES.has(file)
      ? parseAlgebraBlocks(raw).map((p)=>({question:p.question, options:p.options, correctAnswer:(resolveAnswerToOption(p.answerRaw, p.options) ?? p.answerRaw).trim(), explanation:p.explanation}))
      : raw.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("পর্ব")).map(l=>parseMathLine(l));
    const leafPaths=leaves.length===2 ? parsedRecs.map((_,i)=> i < Math.ceil(parsedRecs.length/2) ? leaves[0] : leaves[1]) : parsedRecs.map(()=>leaves[0]);
    let fa=0, fr=0;
    for(let i=0;i<parsedRecs.length;i++){
      const parsed=parsedRecs[i]; if(!parsed){fr++; totalRejected++; continue;}
      const gate=scanMca(parsed); if(gate.verdict==="REJECT"){fr++; totalRejected++; for(const f of gate.fatal) rejects[f.code+"@"+f.field]=(rejects[f.code+"@"+f.field]||0)+1; continue;}
      const norm=gate.normalized;
      const sig=mcaSignature({question:norm.question, options:norm.options, correctAnswer:norm.correctAnswer, explanation:norm.explanation});
      if(existingTexts.has(norm.question.normalize("NFC"))){ fr++; totalRejected++; rejects["DUPLICATE_GLOBAL"]=(rejects["DUPLICATE_GLOBAL"]||0)+1; continue;}
      const path=isGeo?routeGeometryLeaf(norm.question, norm.explanation):leafPaths[i];
      const key=sourceKey(subject.id, path, norm.question);
      if(seenKeys.has(key) || existingKeys.has(key)){ fr++; totalRejected++; rejects["DUPLICATE_SOURCEKEY"]=(rejects["DUPLICATE_SOURCEKEY"]||0)+1; continue;}
      const parts=path.split("/"); const topicName=parts[1]??""; const subtopicName=parts[2]??"";
      candidates.push({subjectId:subject.id, sourceKey:key, topicId:leafIds.get(path)??null, path, topic:topicName, subtopic:subtopicName, question:norm.question, options:norm.options, correctAnswer:norm.correctAnswer, explanation:norm.explanation, difficulty:"MEDIUM", sourceExam:"BCS", year:null});
      seenKeys.add(key); dupSet.add(sig); fa++; totalAccepted++;
    }
    console.log(`${file}: ${fa} accepted, ${fr} rejected`);
  }
  console.log(`Total accepted ${totalAccepted} rejected ${totalRejected}`, rejects);
  if(candidates.length){
    // batch create
    const batch=200;
    for(let i=0;i<candidates.length;i+=batch){
      await prisma.question.createMany({data:candidates.slice(i,i+batch)});
      console.log(` inserted batch ${i} - ${Math.min(i+batch,candidates.length)}`);
    }
  }
  // refresh counts
  const counts=await prisma.question.groupBy({by:["path"], where:{subjectId:subject.id}, _count:{_all:true}});
  for(const row of counts){
    const tid=leafIds.get(row.path); if(tid) await prisma.topic.update({where:{id:tid}, data:{questionCount:String(row._count._all)}});
  }
  console.log("Done inserted",candidates.length);
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>new PrismaClient().$disconnect());
