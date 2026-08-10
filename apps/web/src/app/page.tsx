import { Footer } from '@/components/Footer';
import { Nav } from '@/components/Nav';
import { BrandMoment } from '@/components/sections/BrandMoment';
import { Download } from '@/components/sections/Download';
import { EarlyAccess } from '@/components/sections/EarlyAccess';
import { Features } from '@/components/sections/Features';
import { Hero } from '@/components/sections/Hero';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { PhoneShowcase } from '@/components/sections/PhoneShowcase';
import { Problem } from '@/components/sections/Problem';

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <PhoneShowcase />
        <Problem />
        <Features />
        <BrandMoment />
        <HowItWorks />
        <EarlyAccess />
        <Download />
      </main>
      <Footer />
    </>
  );
}
