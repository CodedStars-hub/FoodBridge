import { useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { dashboardPath } from '../auth/AuthContext.js';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowUpRight, Sprout, Menu, X } from 'lucide-react';
export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="FoodBridge home">
      <span className="brand-icon">
        <Sprout size={23} />
      </span>
      Food<span>Bridge</span>
      <span className="brand-dot">.</span>
    </Link>
  );
}
export default function Layout() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <button
            className="menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
          <nav
            id="primary-nav"
            aria-label="Main navigation"
            className={menuOpen ? 'navigation open' : 'navigation'}
            onClick={() => setMenuOpen(false)}
          >
            <a href="/#how-it-works">How it works</a>
            <a href="/#our-impact">Why FoodBridge</a>
            {user ? (
              <Link
                className="button button-small"
                to={dashboardPath(user.role)}
              >
                My dashboard <ArrowUpRight size={16} />
              </Link>
            ) : (
              <>
                <NavLink className="login-link" to="/login">
                  Log in
                </NavLink>
                <Link className="button button-small" to="/register">
                  Join the movement <ArrowUpRight size={16} />
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" key={pathname} tabIndex={-1}>
        <Outlet />
      </main>
      <footer>
        <div className="container footer-top">
          <div>
            <Brand />
            <p>Good food deserves a second chance.</p>
          </div>
          <div className="footer-links">
            <Link to="/register?role=donor">For food donors</Link>
            <Link to="/register?role=ngo">For NGOs</Link>
            <a href="/#how-it-works">How it works</a>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} FoodBridge</span>
          <span>
            Less waste. More possibility. <Sprout size={14} />
          </span>
        </div>
      </footer>
    </>
  );
}
