import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Route,
  History,
  HandHeart,
  Utensils,
  Sprout,
  Check,
  MoveUpRight,
} from 'lucide-react';
import {
  FoodPhoto,
  PublicButton,
  SectionLabel,
} from '../components/PublicSite.jsx';
const steps = [
  {
    number: '01',
    icon: Utensils,
    title: 'Share available food.',
    text: 'List your surplus, quantity and pickup window. Add the storage, handling and allergen details an organization needs to know.',
  },
  {
    number: '02',
    icon: HandHeart,
    title: 'Find a community connection.',
    text: 'Eligible, verified NGOs can request what they can use. Donors review requests and reserve the agreed quantity.',
  },
  {
    number: '03',
    icon: Route,
    title: 'Pass it on, with care.',
    text: 'Coordinate direct collection or a volunteer pickup. The donor confirms handover; the receiving NGO confirms receipt.',
  },
];
const features = [
  {
    icon: MapPin,
    title: 'Closer connections',
    text: 'Location-based discovery helps organizations find available food nearby.',
  },
  {
    icon: HandHeart,
    title: 'Thoughtful coordination',
    text: 'Clear requests and reservations keep donors and organizations on the same page.',
  },
  {
    icon: Route,
    title: 'A shared way forward',
    text: 'Follow volunteer pickup progress, from assignment to confirmed delivery.',
  },
  {
    icon: History,
    title: 'A story you can follow',
    text: 'Donation history records handovers and receipts, so everyone can see their own activity.',
  },
];
function Branch({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 150"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M61 143C60 102 70 61 91 13M66 102C34 99 20 77 16 55C42 55 61 69 66 102ZM74 70C82 44 101 40 116 42C115 61 100 78 74 70ZM82 42C55 41 44 24 42 8C62 7 82 21 82 42"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export default function LandingPage() {
  return (
    <>
      <section
        className="public-hero public-container"
        aria-labelledby="hero-heading"
      >
        <div className="public-hero-copy">
          <p className="public-kicker">
            <span />
            Good things belong together.
          </p>
          <h1 id="hero-heading">
            Good food
            <br />
            deserves a<br />
            <em>second story.</em>
          </h1>
          <p className="public-hero-description">
            FoodBridge connects surplus food with communities that can put it to
            good use. Less waste, more shared possibility.
          </p>
          <div className="public-hero-actions">
            <PublicButton to="/register?role=donor">
              Share surplus food
            </PublicButton>
            <Link className="public-text-link" to="/register?role=ngo">
              Find food for your community{' '}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <p className="public-hero-note">
            <Sprout size={17} aria-hidden="true" /> A small step. A shared
            table.
          </p>
        </div>
        <div className="public-hero-art">
          <div className="public-photo-frame">
            <FoodPhoto
              name="harvest"
              alt="Hands arranging cabbage, tomatoes and citrus in a woven harvest basket"
              eager
            />
          </div>
          <Branch className="public-hero-branch" />
          <div className="public-story-seal" aria-hidden="true">
            <Sprout size={28} strokeWidth={1.3} />
            <span>
              Too good
              <br />
              <em>to go to waste.</em>
            </span>
          </div>
          <div className="public-photo-caption">
            <span>Fresh possibilities, shared.</span>
            <span>
              Food is just the beginning. <MoveUpRight size={15} />
            </span>
          </div>
        </div>
      </section>
      <div className="public-community-strip">
        <div className="public-container">
          <p>A place at the table for</p>
          <span>
            <Utensils size={18} />
            Cafeterias & restaurants
          </span>
          <span>
            <HandHeart size={19} />
            Community organizations
          </span>
          <span>
            <Sprout size={19} />
            People who care
          </span>
        </div>
      </div>
      <section
        className="public-problem public-container public-section"
        id="the-idea"
        aria-labelledby="idea-heading"
      >
        <SectionLabel number="01">A better connection</SectionLabel>
        <div className="public-problem-heading">
          <h2 id="idea-heading">
            The food is there.
            <br />
            <em>So is the possibility.</em>
          </h2>
          <div>
            <p>
              At the end of a service, good food can be left without a next
              step. Nearby, community organizations are working to bring people
              to the table.
            </p>
            <p>
              FoodBridge creates a practical connection between the two. A place
              to share what’s available, find what’s needed, and work out what
              happens next.
            </p>
          </div>
        </div>
        <div className="public-story-grid">
          <figure className="public-story-photo">
            <FoodPhoto
              name="basket"
              alt="A person carefully placing fresh garden vegetables into a wicker basket"
            />
            <figcaption>
              Something worth sharing. Someone ready to make use of it.
            </figcaption>
          </figure>
          <div className="public-story-note">
            <span className="public-handwritten">
              A different kind of
              <br />
              food story.
            </span>
            <Branch />
            <p>
              Not every good thing
              <br />
              needs to be new.
              <br />
              <strong>
                Sometimes, it just needs
                <br />a new connection.
              </strong>
            </p>
            <a className="public-text-link" href="#how-it-works">
              See how it comes together <ArrowRight size={18} />
            </a>
          </div>
        </div>
      </section>
      <section
        className="public-how public-section"
        id="how-it-works"
        aria-labelledby="how-heading"
      >
        <div className="public-container">
          <div className="public-section-heading">
            <div>
              <SectionLabel number="02">
                Simple steps, shared purpose
              </SectionLabel>
              <h2 id="how-heading">
                From surplus
                <br />
                to <em>someone’s next meal.</em>
              </h2>
            </div>
            <p>
              A little coordination can open
              <br />a whole new chapter.
            </p>
          </div>
          <ol className="public-steps">
            {steps.map(({ number, icon: Icon, title, text }) => (
              <li key={number}>
                <div className="public-step-top">
                  <span>{number}</span>
                  <Icon size={32} strokeWidth={1.3} aria-hidden="true" />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <p className="public-safety-note">
            <Check size={15} aria-hidden="true" /> Food details are donor
            declarations. Pickup windows and platform matching do not certify
            food safety.
          </p>
        </div>
      </section>
      <section
        className="public-community public-section public-container"
        id="community"
        aria-labelledby="community-heading"
      >
        <SectionLabel number="03">Built around people</SectionLabel>
        <div className="public-section-heading">
          <h2 id="community-heading">
            Different roles.
            <br />
            <em>One shared table.</em>
          </h2>
          <p>
            Good food goes further
            <br />
            when we move together.
          </p>
        </div>
        <div className="public-role-grid">
          <article className="public-role public-role-donor">
            <div className="public-role-illustration" aria-hidden="true">
              <Utensils size={74} strokeWidth={1} />
              <span className="public-role-orbit" />
              <Sprout size={45} strokeWidth={1.1} />
            </div>
            <span className="public-role-label">For food donors</span>
            <h3>
              A little surplus.
              <br />A lot of possibility.
            </h3>
            <p>
              Give extra food a next step. Share from your cafeteria, restaurant
              or kitchen.
            </p>
            <Link to="/register?role=donor">
              Become a food donor <ArrowUpRight size={20} />
            </Link>
          </article>
          <article className="public-role public-role-ngo">
            <FoodPhoto
              name="shared-table"
              alt="A colorful spread of vegetable dishes and greens ready for a shared meal"
              sizes="(max-width: 760px) 90vw, 30vw"
            />
            <div className="public-role-content">
              <span className="public-role-label">
                For NGOs & organizations
              </span>
              <h3>
                More connection.
                <br />
                More possibility.
              </h3>
              <p>
                Discover available food and coordinate collections for your
                community.
              </p>
              <Link to="/register?role=ngo">
                Join as an organization <ArrowUpRight size={20} />
              </Link>
            </div>
          </article>
          <article className="public-role public-role-volunteer">
            <div className="public-volunteer-art" aria-hidden="true">
              <span />
              <Route size={83} strokeWidth={1} />
              <span />
            </div>
            <span className="public-role-label">For volunteers</span>
            <h3>
              Be the hands
              <br />
              that help it happen.
            </h3>
            <p>
              Help connect the dots. Take on a pickup and move good food
              forward.
            </p>
            <Link to="/register?role=volunteer">
              Lend a hand <ArrowUpRight size={20} />
            </Link>
          </article>
        </div>
      </section>
      <section
        className="public-why public-section"
        id="why-foodbridge"
        aria-labelledby="why-heading"
      >
        <div className="public-container public-why-grid">
          <div>
            <SectionLabel number="04">Why FoodBridge</SectionLabel>
            <h2 id="why-heading">
              Good intentions.
              <br />
              <em>
                A practical way
                <br />
                to follow through.
              </em>
            </h2>
            <p>
              From finding a nearby listing to confirming a receipt, the details
              belong in one place.
            </p>
            <div className="public-why-symbol" aria-hidden="true">
              <Sprout size={76} strokeWidth={1} />
              <span>
                Less friction.
                <br />
                More connection.
              </span>
            </div>
          </div>
          <div className="public-features">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <Icon size={25} strokeWidth={1.3} aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section
        className="public-final public-container"
        aria-labelledby="final-heading"
      >
        <div className="public-final-inner">
          <SectionLabel>The next chapter starts with you</SectionLabel>
          <h2 id="final-heading">
            Something good
            <br />
            is worth <em>passing on.</em>
          </h2>
          <p>
            Have food to share? A community to support?
            <br />
            There’s a place for you here.
          </p>
          <div className="public-final-actions">
            <PublicButton to="/register?role=donor">
              Share surplus food
            </PublicButton>
            <PublicButton variant="outline" to="/register?role=ngo">
              Join as an NGO
            </PublicButton>
          </div>
          <Branch className="public-final-branch" />
        </div>
      </section>
    </>
  );
}
