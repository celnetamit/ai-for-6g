
import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-surface-light dark:bg-surface-dark mt-auto py-8 border-t border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-secondary dark:text-gray-400">
        <div className="flex justify-center space-x-6 mb-4">
          <Link to="/legal/privacy" className="hover:text-primary dark:hover:text-white">Privacy Policy</Link>
          <Link to="/legal/terms" className="hover:text-primary dark:hover:text-white">Terms of Service</Link>
          <Link to="/about" className="hover:text-primary dark:hover:text-white">About</Link>
        </div>
        <p>Contact us at <a href="mailto:info@nstc.in" className="text-primary hover:underline">info@nstc.in</a></p>
        <p className="mt-2">© {currentYear} nanoschool.in and Nano Science and Technology Consortium (NSTC). All rights reserved.</p>
        <p className="text-xs mt-4">This is a demo application for educational purposes. All content is illustrative.</p>
      </div>
    </footer>
  );
};

export default Footer;
