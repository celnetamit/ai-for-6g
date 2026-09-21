import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useLab } from '../context/LabContext';
import SunIcon from './icons/SunIcon';
import MoonIcon from './icons/MoonIcon';
import LogoIcon from './icons/LogoIcon';
import Button from './ui/Button';
import MenuIcon from './icons/MenuIcon';
import CloseIcon from './icons/CloseIcon';

/**
 * Navigation for a lab with twelve destinations.
 *
 * Six of them are primary and stay on the bar; the rest live behind "More".
 * The alternative — every route on one row — either wraps to two lines at
 * laptop width or shrinks the labels until they stop being readable, and a
 * navigation bar that needs to be read carefully is not doing its job.
 */

interface NavItem {
  to: string;
  label: string;
  /** `end` keeps "/" from matching every route as active. */
  end?: boolean;
}

const PRIMARY: NavItem[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/knowledge-bank', label: 'Knowledge Bank' },
  { to: '/experiments', label: 'Experiments' },
  { to: '/models', label: 'AI Models' },
  { to: '/datasets', label: 'Datasets' },
  { to: '/history', label: 'History' },
];

const SECONDARY: NavItem[] = [
  { to: '/levels', label: 'Learning level' },
  { to: '/lessons', label: 'Lessons' },
  { to: '/tools', label: 'Interactive tools' },
  { to: '/capstone', label: 'Capstone project' },
  { to: '/about', label: 'About this lab' },
];

const linkClass = (isActive: boolean, mobile: boolean): string => {
  const base = mobile
    ? 'block rounded-md px-3 py-2 text-base font-medium'
    : 'rounded-md px-3 py-2 text-sm font-medium transition-colors';
  return `${base} ${
    isActive
      ? 'bg-primary text-white'
      : 'text-on-surface-light hover:bg-gray-200 dark:text-on-surface-dark dark:hover:bg-gray-700'
  }`;
};

const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { level } = useLab();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
    setMoreOpen(false);
  }, [location]);

  // A dropdown that only closes on its own trigger is a dropdown that gets
  // left open over the page the learner is trying to read.
  const onDocumentPointerDown = useCallback((event: PointerEvent) => {
    if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    document.addEventListener('pointerdown', onDocumentPointerDown);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [moreOpen, onDocumentPointerDown]);

  return (
    <header className="sticky top-0 z-50 bg-surface-light shadow-md dark:bg-surface-dark">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center">
            <NavLink
              to="/"
              className="flex flex-shrink-0 items-center gap-2 text-primary dark:text-white"
            >
              <LogoIcon />
              <span className="hidden text-xl font-bold sm:inline">AI for 6G</span>
            </NavLink>

            <nav className="ml-8 hidden items-center gap-1 lg:flex" aria-label="Main">
              {PRIMARY.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => linkClass(isActive, false)}
                >
                  {item.label}
                </NavLink>
              ))}

              <div className="relative" ref={moreRef}>
                <button
                  type="button"
                  onClick={() => setMoreOpen((open) => !open)}
                  aria-expanded={moreOpen}
                  aria-haspopup="true"
                  className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-on-surface-light transition-colors hover:bg-gray-200 dark:text-on-surface-dark dark:hover:bg-gray-700"
                >
                  More
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    aria-hidden="true"
                    className={moreOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
                  >
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {moreOpen && (
                  <div className="absolute right-0 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-surface-light py-1 shadow-lg dark:border-gray-700 dark:bg-surface-dark">
                    {SECONDARY.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `block px-4 py-2 text-sm ${
                            isActive
                              ? 'bg-primary text-white'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {level && (
              <NavLink
                to="/levels"
                className="hidden rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold capitalize transition-colors hover:border-primary hover:text-primary dark:border-gray-600 xl:inline-block"
              >
                {level}
              </NavLink>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-full p-2 text-on-surface-light hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:text-on-surface-dark dark:hover:bg-gray-700"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
            </button>
            <div className="hidden sm:block">
              <Button onClick={logout} variant="secondary">
                Logout
              </Button>
            </div>
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="inline-flex items-center justify-center rounded-md p-2 text-on-surface-light hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary dark:text-on-surface-dark dark:hover:bg-gray-700"
                aria-controls="mobile-menu"
                aria-expanded={menuOpen}
              >
                <span className="sr-only">Open main menu</span>
                {menuOpen ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-gray-200 lg:hidden dark:border-gray-700" id="mobile-menu">
          <nav className="space-y-1 px-2 pb-3 pt-2 sm:px-3" aria-label="Main">
            {[...PRIMARY, ...SECONDARY].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => linkClass(isActive, true)}
              >
                {item.label}
              </NavLink>
            ))}
            <div className="mt-4 border-t border-gray-200 pt-4 sm:hidden dark:border-gray-700">
              <Button onClick={logout} variant="secondary" className="w-full">
                Logout
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
