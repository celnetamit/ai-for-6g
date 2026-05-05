
import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';

const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark text-center px-4">
      <div>
        <h1 className="text-6xl font-extrabold text-primary">404</h1>
        <p className="text-2xl font-semibold text-on-surface-light dark:text-on-surface-dark mt-4">Page Not Found</p>
        <p className="text-secondary dark:text-gray-400 mt-2">Sorry, the page you are looking for does not exist.</p>
        <Link to="/">
          <Button className="mt-8">Go Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
