import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Sprout, ArrowUpRight } from 'lucide-react';
import { PublicBrand, FoodPhoto } from './PublicSite.jsx';
import '../auth-experience.css';

export default function AuthShell({ children }) {
  const registering = useLocation().pathname === '/register';
  return (
    <div
      className={`auth-experience${registering ? ' auth-experience-register' : ''}`}
    >
      <a className="auth-skip" href="#auth-main">
        Skip to form
      </a>
      <header className="auth-masthead">
        <PublicBrand />
        <Link className="auth-home-link" to="/">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to home
        </Link>
      </header>
      <div className="auth-layout">
        <aside className="auth-editorial" aria-label="A shared purpose">
          <div className="auth-editorial-copy">
            <p className="auth-editorial-label">
              <span />
              Good things belong together.
            </p>
            <h2>
              {registering ? (
                <>
                  Every good thing
                  <br />
                  starts with
                  <br />
                  <em>a connection.</em>
                </>
              ) : (
                <>
                  Good food.
                  <br />
                  <em>
                    Shared
                    <br />
                    possibility.
                  </em>
                </>
              )}
            </h2>
            <p>
              {registering
                ? 'A little surplus. A helping hand. A community to support. There’s a place for you at the table.'
                : 'Reconnect with a community giving surplus food a thoughtful next step.'}
            </p>
          </div>
          <div className="auth-editorial-photo">
            <FoodPhoto
              name={registering ? 'harvest' : 'basket'}
              eager
              alt={
                registering
                  ? 'Hands arranging fresh vegetables together in a woven basket'
                  : 'Fresh vegetables being carefully gathered into a wicker basket'
              }
              sizes="(max-width: 850px) 0px, 44vw"
            />
            <div className="auth-photo-tag">
              <Sprout size={20} strokeWidth={1.5} aria-hidden="true" />
              <span>
                Better together,
                <br />
                <em>by nature.</em>
              </span>
            </div>
          </div>
          <p className="auth-editorial-footnote">
            A small step. A shared table.
            <ArrowUpRight size={16} aria-hidden="true" />
          </p>
        </aside>
        <main id="auth-main" className="auth-main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <footer className="auth-small-print">
        <span>FoodBridge · Less waste. More shared possibility.</span>
        <Link to="/#how-it-works">
          How FoodBridge works <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
