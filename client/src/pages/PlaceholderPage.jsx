import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
export default function PlaceholderPage() {
  return (
    <section className="container placeholder">
      <span className="eyebrow">PAGE NOT FOUND</span>
      <h1>A little off the path.</h1>
      <p className="placeholder-intro">We couldn’t find that page.</p>
      <div className="placeholder-notice">
        <strong>Let’s get you back.</strong>
        <p>Head back home to explore FoodBridge.</p>
      </div>
      <Link className="button" to="/">
        <ArrowLeft size={17} />
        Back to home
      </Link>
    </section>
  );
}
