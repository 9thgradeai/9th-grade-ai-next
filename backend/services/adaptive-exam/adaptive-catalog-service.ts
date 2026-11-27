// backend/services/adaptive-exam/adaptive-catalog-service.ts
// Exam hierarchy catalog: family → organisation → post → type → profile.
// The tree is derived from versioned profiles plus declared "Others"
// organisations. New organisations/posts can be registered in the DB catalog;
// this service is the single read seam used by the standalone tab.

import "server-only";

import type {
  AdaptiveCatalogService,
  AdaptiveCatalogStore,
  AdaptiveExamProfileId,
  ExamCatalog,
  ExamFamily,
  ExamProfile,
  ExamProfileRegistry,
  ProfileSummary,
} from "./contracts";
import { UNAVAILABLE_PROFILES } from "./profile-seeds";

type CatalogFamily = ExamCatalog["families"][number];

const ORGANIZATIONS: Array<{ code: string; family: CatalogFamily; nameBn: string; nameEn: string }> = [
  { code: "BPSC", family: "BCS", nameBn: "বাংলাদেশ পাবলিক সার্ভিস কমিশন", nameEn: "Bangladesh Public Service Commission" },
  { code: "BB", family: "BANK", nameBn: "বাংলাদেশ ব্যাংক", nameEn: "Bangladesh Bank" },
  { code: "PETROBANGLA", family: "OTHERS", nameBn: "পেট্রোবাংলা", nameEn: "Petrobangla" },
  { code: "BEPZA", family: "OTHERS", nameBn: "বিএপজেএ", nameEn: "BEPZA" },
  { code: "BEZA", family: "OTHERS", nameBn: "বেজা", nameEn: "BEZA" },
  { code: "BIDA", family: "OTHERS", nameBn: "বিডা", nameEn: "BIDA" },
  { code: "NSI", family: "OTHERS", nameBn: "এনএসআই", nameEn: "NSI" },
];

function familyOf(profile: ExamProfile): CatalogFamily {
  if (profile.id.startsWith("BCS")) return "BCS";
  if (profile.id.startsWith("BB") || profile.id.startsWith("BANK")) return "BANK";
  return "OTHERS";
}

function profileTypeId(profile: ExamProfile): string {
  if (profile.id === "BCS_PRELIMINARY") return "GENERAL";
  if (profile.id === "BCS_SPECIAL") return "SPECIAL";
  if (profile.id.includes("IT")) return "ICT";
  if (profile.id.includes("CASH")) return "CASH";
  return "GENERAL";
}

function toSummary(profile: ExamProfile): ProfileSummary {
  return {
    id: profile.id,
    version: profile.version,
    family: profile.family,
    organization: profile.organization,
    recruitmentPost: profile.recruitmentPost,
    stage: profile.stage,
    labelBn: profile.labelBn,
    labelEn: profile.labelEn,
    totalQuestions: profile.totalQuestions,
    totalMarks: profile.totalMarks,
    durationMin: profile.durationMin,
    verificationStatus: profile.verificationStatus,
    provisional: profile.provisional,
    historicalDataEligible: profile.historicalDataEligible,
    subjects: profile.subjects.map((subject) => ({
      subjectId: subject.subjectId,
      nameBn: subject.nameBn,
      nameEn: subject.nameEn,
      count: subject.count,
      language: subject.language,
    })),
  };
}

export function createAdaptiveCatalogService(
  registry: ExamProfileRegistry,
  store?: AdaptiveCatalogStore,
): AdaptiveCatalogService {
  return {
    async catalog() {
      const profiles = await registry.list();
      const dbOrgs = store ? await store.organizations() : [];
      const dbPosts = store ? await store.posts() : [];
      const dbTypes = store ? await store.types() : [];
      const organizations = [...ORGANIZATIONS.map((org) => ({ ...org, id: org.code, active: true }))];
      for (const org of dbOrgs) {
        if (!organizations.some((existing) => existing.code === org.code)) organizations.push(org);
      }
      const catalog: ExamCatalog = {
        families: ["BCS", "BANK", "OTHERS"],
        organizations,
        posts: [...dbPosts],
        types: [...dbTypes],
      };
      const postSeen = new Set<string>();
      for (const profile of profiles) {
        const family = familyOf(profile);
        const orgCode = family === "BCS" ? "BPSC" : family === "BANK" ? "BB" : family;
        const postCode = profile.recruitmentPost.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
        const hasDbPost = catalog.posts.some(
          (post) => post.organizationId === orgCode && post.code === postCode,
        );
        if (!postSeen.has(`${orgCode}:${postCode}`) && !hasDbPost) {
          postSeen.add(`${orgCode}:${postCode}`);
          catalog.posts.push({
            id: `${orgCode}:${postCode}`,
            code: postCode,
            nameBn: profile.labelBn,
            nameEn: profile.recruitmentPost,
            organizationId: orgCode,
            active: true,
          });
        }
        const typeCode = profileTypeId(profile);
        catalog.types.push({
          id: `${orgCode}:${postCode}:${typeCode}`,
          postId: `${orgCode}:${postCode}`,
          code: typeCode,
          nameBn: profile.labelBn,
          nameEn: typeCode.charAt(0) + typeCode.slice(1).toLowerCase(),
          profileId: profile.id,
          active: true,
        });
      }
      for (const unavailable of UNAVAILABLE_PROFILES) {
        const orgCode = unavailable.id.replace("OTHERS_", "");
        if (!catalog.posts.some((post) => post.organizationId === orgCode)) {
          catalog.posts.push({
            id: `${orgCode}:RECRUITMENT`,
            code: "RECRUITMENT",
            nameBn: orgCode,
            nameEn: orgCode,
            organizationId: orgCode,
            active: true,
          });
        }
      }
      return catalog;
    },

    async profiles(filter) {
      const profiles = await registry.list(filter?.family);
      return profiles
        .filter((profile) => !filter?.profileId || profile.id === filter.profileId)
        .map(toSummary);
    },
  };
}

/** Profile ids the catalog can display even when no syllabus is available. */
export function availableProfileIds(profiles: readonly ExamProfile[]): AdaptiveExamProfileId[] {
  return profiles.map((profile) => profile.id);
}
