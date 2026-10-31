import('@prisma/client').then(async (m) => {
  const PrismaClient = m.PrismaClient;
  const p = new PrismaClient();
  try {
    const bb = await p.examEcosystem.findUnique({where:{code:'BANGLADESH_BANK'}});
    if(!bb) { console.log('BANGLADESH_BANK ecosystem not found'); return; }
    const subject = await p.subject.findFirst({where:{ecosystemId:bb.id,nameEn:'Financial Knowledge'}});
    if(!subject) { console.log('Financial Knowledge subject not found'); return; }
    const count = await p.question.count({where:{subjectId:subject.id}});
    console.log('Current questions in Financial Knowledge subject:', count);
    const topics = await p.topic.findMany({where:{subjectId:subject.id},select:{name:true,path:true,questionCount:true}});
    console.log('Topics:', JSON.stringify(topics, null, 2));
    await p.$disconnect();
  } catch (e) {
    console.error('Error:', e);
    await p.$disconnect();
    process.exit(1);
  }
});