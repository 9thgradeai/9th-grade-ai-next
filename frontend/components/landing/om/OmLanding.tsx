import OmHeader from "./OmHeader";
import OmHero from "./OmHero";
import OmGallery from "./OmGallery";
import OmHowItWorks from "./OmHowItWorks";
import OmAgentSection from "./OmAgentSection";
import OmStudioSection from "./OmStudioSection";
import OmNoLockIn from "./OmNoLockIn";
import OmFaq from "./OmFaq";
import OmCta from "./OmCta";
import OmFooter from "./OmFooter";

export default function OmLanding({ questionCount }: { questionCount: number }) {
  return (
    <div className="om-scope">
      <OmHeader />
      <main id="main">
        <OmHero questionCount={questionCount} />
        <OmGallery />
        <OmHowItWorks />
        <OmAgentSection />
        <OmStudioSection />
        <OmNoLockIn />
        <OmFaq />
        <OmCta />
      </main>
      <OmFooter />
    </div>
  );
}
