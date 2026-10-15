import Hero from "@/components/landing/Hero";
import SwapExplainer from "@/components/landing/SwapExplainer";
import RepairSection from "@/components/landing/RepairSection";
import { PaintDefs } from "@/components/landing/paint";
import VideoShowcase from "@/components/landing/VideoShowcase";
import { AuditHistory, FinalCTA, Footer, Pipeline, Promises, Results, StoryBand, TopNav } from "@/components/landing/Sections";

export default function Home() {
  return (
    <div className="landing">
      <PaintDefs />
      <TopNav />
      <main>
        <Hero />
        <VideoShowcase />
        <StoryBand />
        <SwapExplainer />
        <RepairSection />
        <Pipeline />
        <AuditHistory />
        <Results />
        <Promises />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
