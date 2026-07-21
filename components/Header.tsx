
import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import SunIcon from './icons/SunIcon';
import MoonIcon from './icons/MoonIcon';
import LogoIcon from './icons/LogoIcon';
import Button from './ui/Button';
import MenuIcon from './icons/MenuIcon';
import CloseIcon from './icons/CloseIcon';

const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Close mobile menu on route change
    setIsMenuOpen(false);
  }, [location]);

  const navItems = [
    { to: "/", label: "Dashboard" },
    { to: "/lessons", label: "Lessons" },
    { to: "/tools", label: "Tools" },
    { to: "/knowledge-bank", label: "Knowledge Bank" },
    { to: "/capstone", label: "Capstone Project" },
    { to: "/about", label: "About" }
  ];

  const getNavLinkClass = (isActive: boolean, isMobile: boolean) => {
    const baseClasses = isMobile 
      ? "block px-3 py-2 rounded-md text-base font-medium"
      : "px-3 py-2 rounded-md text-sm font-medium transition-colors";
    
    const activeClasses = "bg-primary text-white";
    const inactiveClasses = "text-on-surface-light dark:text-on-surface-dark hover:bg-gray-200 dark:hover:bg-gray-700";

    return `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`;
  };

  return (
    <header className="glass-morphism sticky top-0 z-50 rounded-b-3xl mb-6 mx-2 mt-2">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <NavLink to="/" className="flex-shrink-0 flex items-center gap-2 text-primary dark:text-white">
              <LogoIcon />
              <span className="font-bold text-xl hidden sm:inline">AI for 6G</span>
            </NavLink>
            <nav className="hidden md:flex md:ml-10 md:space-x-4">
              {navItems.map(item => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => getNavLinkClass(isActive, false)}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-on-surface-light dark:text-on-surface-dark hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
            </button>
            <div className="hidden sm:block">
              <Button onClick={logout} variant="secondary">Logout</Button>
            </div>
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 inline-flex items-center justify-center rounded-md text-on-surface-light dark:text-on-surface-dark hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
                aria-controls="mobile-menu"
                aria-expanded={isMenuOpen}
              >
                <span className="sr-only">Open main menu</span>
                {isMenuOpen ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700" id="mobile-menu">
          <nav className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navItems.map(item => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => getNavLinkClass(isActive, true)}>
                  {item.label}
                </NavLink>
              ))}
            <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 sm:hidden">
                <Button onClick={logout} variant="secondary" className="w-full">Logout</Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;