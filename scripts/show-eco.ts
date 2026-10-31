import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main(){
 const eco = await prisma.examEcosystem.findUnique({where:{code:'BANGLADESH_BANK'}});
 console.log('ecosystem:',eco);
}
main().catch(e=>console.error(e)).finally(()=>prisma.$disconnect());