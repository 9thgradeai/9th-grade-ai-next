import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main(){
  const subj = await prisma.subject.findFirst({where:{nameEn:'Financial Knowledge'}});
  if(!subj){console.log('subject not found');return;}
  const cnt = await prisma.question.count({where:{subjectId:subj.id}});
  console.log('Financial Knowledge total questions:',cnt);
}
main().catch(e=>{console.error(e);}).finally(()=>prisma.$disconnect());