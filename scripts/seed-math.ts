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
  };
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
    const lines=raw.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("পর্ব"));
    const leaves=fileLeafMap[file]||["08_গাণিতিক_যুক্তি/Part_01_পাটিগণিত/বাস্তব_সংখ্যা"];
    const leafPaths=leaves.length===2 ? lines.map((_,i)=> i < Math.ceil(lines.length/2) ? leaves[0] : leaves[1]) : lines.map(()=>leaves[0]);
    let fa=0, fr=0;
    for(let i=0;i<lines.length;i++){
      const parsed=parseMathLine(lines[i]); if(!parsed){fr++; totalRejected++; continue;}
      const gate=scanMca(parsed); if(gate.verdict==="REJECT"){fr++; totalRejected++; for(const f of gate.fatal) rejects[f.code+"@"+f.field]=(rejects[f.code+"@"+f.field]||0)+1; continue;}
      const norm=gate.normalized;
      const sig=mcaSignature({question:norm.question, options:norm.options, correctAnswer:norm.correctAnswer, explanation:norm.explanation});
      if(existingTexts.has(norm.question.normalize("NFC"))){ fr++; totalRejected++; rejects["DUPLICATE_GLOBAL"]=(rejects["DUPLICATE_GLOBAL"]||0)+1; continue;}
      const path=leafPaths[i];
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
