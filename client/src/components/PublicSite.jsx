import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Menu, X, Sprout } from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { dashboardPath } from '../auth/AuthContext.js';
import '../public-site.css';

export function PublicBrand({ light = false }) {
  return (
    <Link
      className={`public-brand${light ? ' public-brand-light' : ''}`}
      to="/"
      aria-label="FoodBridge home"
    >
      <span className="public-brand-mark">
        <Sprout size={24} strokeWidth={1.6} />
      </span>
      FoodBridge<span className="public-brand-period">.</span>
    </Link>
  );
}
export function PublicButton({
  children,
  to,
  variant = 'primary',
  className = '',
}) {
  return (
    <Link
      className={`public-button public-button-${variant} ${className}`}
      to={to}
    >
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  );
}
export function SectionLabel({ children, number }) {
  return (
    <p className="public-section-label">
      {number && <span>{number}</span>}
      {children}
    </p>
  );
}
export function FoodPhoto({
  name,
  alt,
  eager = false,
  className = '',
  sizes = '(max-width: 760px) 90vw, 45vw',
}) {
  return (
    <img
      className={className}
      src={`/images/${name}-960.webp`}
      srcSet={`/images/${name}-480.webp 480w, /images/${name}-960.webp 960w, /images/${name}-1440.webp 1440w`}
      sizes={sizes}
      width={960}
      height={name === 'harvest' ? 1200 : 640}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      decoding="async"
    />
  );
}
const sections = [
  ['The idea', '/#the-idea'],
  ['How it works', '/#how-it-works'],
  ['Our community', '/#community'],
];
export default function PublicSite({ children }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);
  return (
    <div className="public-site">
      <a className="public-skip" href="#main">
        Skip to content
      </a>
      <header className="public-header">
        <div className="public-container public-header-inner">
          <PublicBrand />
          <button
            ref={toggle}
            className="public-menu-toggle"
            type="button"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
            aria-controls="public-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
          <nav
            id="public-navigation"
            className={`public-navigation${open ? ' is-open' : ''}`}
            aria-label="Main navigation"
            onClick={() => setOpen(false)}
          >
            <div className="public-nav-sections">
              {sections.map(([title, href]) => (
                <a key={href} href={href}>
                  {title}
                </a>
              ))}
            </div>
            <div className="public-nav-actions">
              {user ? (
                <PublicButton to={dashboardPath(user.role)}>
                  My dashboard
                </PublicButton>
              ) : (
                <>
                  <Link className="public-login" to="/login">
                    Log in
                  </Link>
                  <PublicButton to="/register">Get started</PublicButton>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="public-footer">
        <div className="public-container">
          <div className="public-footer-top">
            <div>
              <PublicBrand light />
              <p>
                A little less waste.
                <br />A little more possibility.
              </p>
            </div>
            <div className="public-footer-links">
              <div>
                <h2>Explore</h2>
                {sections.map(([title, href]) => (
                  <a key={href} href={href}>
                    {title}
                  </a>
                ))}
                <a href="/#why-foodbridge">Why FoodBridge</a>
              </div>
              <div>
                <h2>Find your place</h2>
                <Link to="/register?role=donor">For food donors</Link>
                <Link to="/register?role=ngo">For organizations</Link>
                <Link to="/register?role=volunteer">For volunteers</Link>
                <Link to="/login">Log in</Link>
              </div>
            </div>
          </div>
          <div className="public-footer-bottom">
            <span>© {new Date().getFullYear()} FoodBridge</span>
            <span>An independent food redistribution platform.</span>
            <span>
              Made for shared possibility{' '}
              <Sprout size={15} aria-hidden="true" />
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
