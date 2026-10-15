import Hero from "@/components/landing/Hero";
import SwapExplainer from "@/components/landing/SwapExplainer";
import { PaintDefs } from "@/components/landing/paint";
import { Footer, StoryBand, TopNav } from "@/components/landing/Sections";
import { Agents, ImpactStrip, SwapTypes, Tracks, TryIt } from "@/components/landing/Story";

// Short on purpose: the problem, the impact, what a swap is, what the agents do, how we meet the tracks, then try it.
export default function Home() {
  return (
    <div className="landing">
      <PaintDefs />
      <TopNav />
      <main>
        <Hero />
        <StoryBand />
        <ImpactStrip />
        <SwapExplainer />
        <SwapTypes />
        <Agents />
        <Tracks />
        <TryIt />
      </main>
      <Footer />
    </div>
  );
}
