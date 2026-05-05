
import React from 'react';

const LogoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    width="32"
    height="32"
    {...props}
  >
    <path d="M12 2.5a9.5 9.5 0 0 1 7.48 15.65A9.5 9.5 0 0 1 12 21.5a9.5 9.5 0 0 1-7.48-15.65A9.5 9.5 0 0 1 12 2.5M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22z" />
    <path d="M12 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3M12 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    <path d="M12 11a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5z" />
    <path d="M15.93 15.93a.5.5 0 0 1 .71 0l2.12 2.12a.5.5 0 0 1-.71.71l-2.12-2.12a.5.5 0 0 1 0-.71z" />
    <path d="M5.24 18.05a.5.5 0 0 1 .71-.71l2.12 2.12a.5.5 0 0 1-.71.71l-2.12-2.12z" />
  </svg>
);

export default LogoIcon;
