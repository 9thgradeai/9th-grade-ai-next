import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  for (const sid of [601, 4958]) {
    // pick 200 random non-matching rows (or all first 200 on this subject)
    const ids = await p.$queryRawUnsafe<{id:number}[]>(
      `SELECT id FROM "Question" WHERE "subjectId"=$1 ORDER BY RANDOM() LIMIT 200`, sid
    );
    const idList = ids.map(x=>x.id);
    const r = await p.$executeRawUnsafe(`UPDATE "Question" SET path='01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/সমার্থক_শব্দ' WHERE id IN (${idList.join(",")})`);
    // set topicId
    const t = await p.topic.findFirst({ where: { subjectId: sid, path: "01_বাংলা_ভাষা_ও_সাহিত্য/ভাষা/সমার্থক_শব্দ" }, select:{id:true} });
    if (t) await p.$executeRawUnsafe(`UPDATE "Question" SET "topicId"=${t.id} WHERE id IN (${idList.join(",")})`);
    console.log(sid, "updated", r, "topicId set", t?.id);
  }
  await p.$disconnect();
}
main().catch(e=>{ console.error(e?.message?.slice(0,200)); process.exit(1); });
