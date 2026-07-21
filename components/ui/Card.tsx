
import React, { ReactNode } from 'react';

// FIX: Extend React.HTMLAttributes<HTMLDivElement> to allow standard div props like 'id'.
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

// FIX: Spread remaining props to the underlying div element.
const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div {...props} className={`bg-surface-light dark:bg-surface-dark rounded-lg shadow-md p-6 transition-colors duration-300 ${className}`}>
      {children}
    </div>
  );
};

export default Card;
