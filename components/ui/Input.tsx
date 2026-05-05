
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const Input: React.FC<InputProps> = ({ label, id, ...props }) => {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-on-surface-light dark:text-on-surface-dark mb-1">
        {label}
      </label>
      <input
        id={id}
        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary text-on-surface-light dark:text-on-surface-dark"
        {...props}
      />
    </div>
  );
};

export default Input;
