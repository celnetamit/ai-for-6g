
import React, { ReactNode } from 'react';

// FIX: Extend React.HTMLAttributes<HTMLDivElement> to allow standard div props like 'id'.
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

// FIX: Spread remaining props to the underlying div element.
const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div {...props} className={`glass-morphism rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${className}`}>
      {children}
    </div>
  );
};

export default Card;
