import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Heart,
  Leaf,
  Sprout,
  Utensils,
  Building2,
  HandHeart,
  PackageCheck,
} from 'lucide-react';
const steps = [
  {
    icon: Utensils,
    number: '01',
    title: 'Share what’s spare',
    text: 'Cafeterias and restaurants will be able to list fresh surplus food, with the details that matter.',
  },
  {
    icon: HandHeart,
    number: '02',
    title: 'Connect with care',
    text: 'Local NGOs will be able to discover available food and coordinate a collection.',
  },
  {
    icon: PackageCheck,
    number: '03',
    title: 'Make good go further',
    text: 'Food reaches people through community partners, giving every rescued meal a greater purpose.',
  },
];
function FoodIllustration() {
  return (
    <div
      className="food-scene"
      role="img"
      aria-label="Illustration of a bowl of fresh vegetables with tomatoes, carrots, and leafy greens"
    >
      <div className="scene-grid" />
      <span className="scene-label">
        <span /> FRESH FOOD. NEW POSSIBILITIES.
      </span>
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="produce-leaf leaf-one" />
      <div className="produce-leaf leaf-two" />
      <div className="produce-leaf leaf-three" />
      <div className="carrot carrot-one" />
      <div className="carrot carrot-two" />
      <div className="bowl">
        <div className="bowl-rim">
          <div className="salad-leaf salad-one" />
          <div className="salad-leaf salad-two" />
          <div className="salad-leaf salad-three" />
          <div className="tomato tomato-one" />
          <div className="tomato tomato-two" />
          <div className="cucumber cucumber-one" />
          <div className="cucumber cucumber-two" />
        </div>
        <span className="bowl-mark">
          <Sprout size={31} /> foodbridge
        </span>
      </div>
      <div className="floating-card rescue-card">
        <span className="mini-icon">
          <Check size={18} />
        </span>
        <div>
          <strong>A little surplus.</strong>
          <span>A whole lot of good.</span>
        </div>
      </div>
      <div className="floating-card heart-card">
        <Heart size={19} fill="currentColor" />
        <span>Made for our communities</span>
      </div>
      <div className="scene-note">
        Too good to waste.
        <svg width="63" height="32" viewBox="0 0 63 32" aria-hidden="true">
          <path
            d="M2 4Q30 34 56 13M47 12l11-2-3 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      </div>
    </div>
  );
}
export default function LandingPage() {
  return (
    <>
      <section className="hero container" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="status-dot" /> SMALL ACTIONS. MEANINGFUL CHANGE.
          </span>
          <h1 id="hero-heading">
            Good food.
            <br />
            Greater{' '}
            <span className="accent-word">
              purpose.
              <svg viewBox="0 0 320 15" aria-hidden="true">
                <path d="M3 10Q147-2 314 8" />
              </svg>
            </span>
          </h1>
          <p className="hero-description">
            Bridge the gap between surplus and need. Help turn extra food into
            an opportunity to nourish your community.
          </p>
          <div className="hero-actions">
            <Link className="button" to="/register?role=donor">
              I want to donate food <ArrowUpRight size={18} />
            </Link>
            <Link className="button button-outline" to="/register?role=ngo">
              I’m an NGO <ArrowRight size={18} />
            </Link>
          </div>
          <div className="hero-footnote">
            <span className="tiny-leaf">
              <Leaf size={16} />
            </span>
            <span>For a world where good food goes further.</span>
          </div>
        </div>
        <FoodIllustration />
      </section>
      <section className="partners-strip" aria-label="Our community">
        <div className="container partner-inner">
          <p>
            One shared table.
            <br />
            <strong>A whole community.</strong>
          </p>
          <span>
            <Building2 /> College cafeterias
          </span>
          <span>
            <Utensils /> Restaurants & cafés
          </span>
          <span>
            <HandHeart /> NGOs & communities
          </span>
        </div>
      </section>
      <section
        className="section container"
        id="how-it-works"
        aria-labelledby="how-heading"
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">A SIMPLE IDEA. A SHARED PURPOSE.</span>
            <h2 id="how-heading">From extra to extraordinary.</h2>
          </div>
          <p>
            A simpler path for good food to find
            <br className="desktop-break" /> the people who need it.
          </p>
        </div>
        <div className="steps-grid">
          {steps.map(({ icon: Icon, number, title, text }) => (
            <article className="step-card" key={number}>
              <div className="step-top">
                <span className="step-icon">
                  <Icon size={25} strokeWidth={1.6} />
                </span>
                <span className="step-number">{number}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <p className="foundation-note">
          We’re laying the foundation. Food listing and collection features are
          coming in future milestones.
        </p>
      </section>
      <section
        className="impact-section"
        id="our-impact"
        aria-labelledby="impact-heading"
      >
        <div className="container impact-grid">
          <div className="impact-art" aria-hidden="true">
            <div className="impact-circle">
              <Sprout size={100} strokeWidth={1.1} />
              <span>
                Every meal
                <br />
                <strong>matters.</strong>
              </span>
            </div>
            <span className="impact-spark spark-one">✳</span>
            <span className="impact-spark spark-two">✳</span>
            <span className="impact-caption">Better together, by nature.</span>
          </div>
          <div className="impact-copy">
            <span className="eyebrow">MORE THAN A MEAL</span>
            <h2>
              Less food wasted.
              <br />
              More good created.
            </h2>
            <p>
              Surplus food is still full of possibility. Connecting food donors
              with NGOs can support communities and keep valuable resources out
              of the bin.
            </p>
            <ul className="impact-list">
              <li>
                <span>
                  <Leaf size={18} />
                </span>
                <div>
                  <strong>A lighter footprint</strong>
                  <p>
                    Make better use of the food and resources we already have.
                  </p>
                </div>
              </li>
              <li>
                <span>
                  <Heart size={18} />
                </span>
                <div>
                  <strong>A stronger community</strong>
                  <p>
                    Bring local businesses and community organisations closer.
                  </p>
                </div>
              </li>
            </ul>
            <Link className="text-link" to="/register">
              Be part of something good <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>
      <section className="container cta-section">
        <div className="cta-card">
          <span className="eyebrow">THERE’S A PLACE FOR YOU HERE</span>
          <h2>
            Let’s make good food
            <br />
            go a little further.
          </h2>
          <p>
            Have food to share? Have a community to serve?
            <br />
            Your next step can make a difference.
          </p>
          <div className="hero-actions">
            <Link className="button button-light" to="/register?role=donor">
              Join as a food donor <ArrowUpRight size={18} />
            </Link>
            <Link className="button button-ghost" to="/register?role=ngo">
              Join as an NGO <ArrowRight size={18} />
            </Link>
          </div>
          <Leaf
            className="cta-leaf"
            size={220}
            strokeWidth={0.7}
            aria-hidden="true"
          />
        </div>
      </section>
    </>
  );
}
