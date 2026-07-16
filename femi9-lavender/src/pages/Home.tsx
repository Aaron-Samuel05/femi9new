import { HeroBanner } from '../components/HeroBanner'
import { Products } from '../components/Products'
import { CycleTracker } from '../components/CycleTracker'
import { WhyBento } from '../components/WhyBento'
import { Collabs } from '../components/Collabs'
import { Story } from '../components/Story'
import { Impact } from '../components/Impact'
import { Cta } from '../components/Cta'
import { ImmersiveShowcase } from '../immersive/ImmersiveShowcase'
import { PadExploder } from '../immersive/PadExploder'
import { Testimonials } from '../immersive/Testimonials'
import { Journal } from '../components/Journal'

export function Home() {
  return (
    <main id="top">
      <HeroBanner />
      <Testimonials />
      <Products />
      <CycleTracker />
      <ImmersiveShowcase />
      <PadExploder />
      <WhyBento />
      <Collabs />
      <Story />
      <Journal />
      <Impact />
      <Cta />
    </main>
  )
}
