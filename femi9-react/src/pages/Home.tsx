import { Hero } from '../components/Hero'
import { Products } from '../components/Products'
import { WhyBento } from '../components/WhyBento'
import { Story } from '../components/Story'
import { Impact } from '../components/Impact'
import { Cta } from '../components/Cta'
import { ImmersiveShowcase } from '../immersive/ImmersiveShowcase'
import { Testimonials } from '../immersive/Testimonials'
import { Journal } from '../components/Journal'

export function Home() {
  return (
    <main id="top">
      <Hero />
      <Testimonials />
      <Products />
      <ImmersiveShowcase />
      <WhyBento />
      <Story />
      <Journal />
      <Impact />
      <Cta />
    </main>
  )
}
