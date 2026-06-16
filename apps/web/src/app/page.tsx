import Link from 'next/link';
import HomeSearch from '@/components/HomeSearch';
import FeaturedBoats from '@/components/FeaturedBoats';
import { ArrowIcon, CheckIcon, ShieldIcon } from '@/components/Icons';

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <img className="hero-bg" src="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=88" alt="" />
        <div className="container hero-content">
          <p className="eyebrow" style={{ color: '#f5c66e' }}>Book the lake, not the hassle</p>
          <h1>Your best day is waiting on the water.</h1>
          <p className="hero-copy">Discover trusted boat rentals from local marinas. Real-time availability, upfront pricing, and everything you need to cast off.</p>
        </div>
      </section>

      <div className="container search-panel"><HomeSearch /></div>
      <div className="container trust-row">
        <span className="trust-item"><CheckIcon /> Verified local marinas</span>
        <span className="trust-item"><ShieldIcon /> Secure checkout</span>
        <span className="trust-item"><CheckIcon /> Clear, upfront pricing</span>
      </div>

      <FeaturedBoats />

      <section className="steps-section" id="how-it-works">
        <div className="container steps-layout">
          <div className="steps-image">
            <img src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1000&q=85" alt="Friends enjoying a day by the lake" />
          </div>
          <div>
            <p className="eyebrow">Simple by design</p>
            <h2 className="section-heading">From shore to open water in three easy steps.</h2>
            <p className="section-copy">Less time organizing. More time making the kind of memories that smell like sunscreen and lake water.</p>
            <div className="steps-list">
              <div className="step">
                <span className="step-number">01</span>
                <div><h3>Find your boat</h3><p>Search by lake, date, group size, and boat style to see real availability.</p></div>
              </div>
              <div className="step">
                <span className="step-number">02</span>
                <div><h3>Book with confidence</h3><p>Review the details, choose useful extras, sign the waiver, and pay securely.</p></div>
              </div>
              <div className="step">
                <span className="step-number">03</span>
                <div><h3>Meet at the marina</h3><p>Your marina handles the walkthrough. You bring the crew and a good playlist.</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="container cta-inner">
          <p className="eyebrow" style={{ color: '#f5c66e' }}>The lake is calling</p>
          <h2>Make this weekend one worth remembering.</h2>
          <p>Fresh air, open water, and the right boat are only a few clicks away.</p>
          <Link href="/boats" className="button button-coral">Find your boat <ArrowIcon /></Link>
        </div>
      </section>
    </main>
  );
}
