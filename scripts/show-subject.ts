import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main(){
 const s = await prisma.subject.findFirst({where:{nameEn:'Financial Knowledge'}});
 console.log('subject:',s);
}
main().catch(e=>console.error(e)).finally(()=>prisma.$disconnect());