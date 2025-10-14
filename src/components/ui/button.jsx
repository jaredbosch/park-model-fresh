import React from 'react';

const baseStyles =
  'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

export const Button = React.forwardRef(({ className = '', type = 'button', ...props }, ref) => {
  return (
    <button
      ref={ref}
      type={type}
      className={`${baseStyles} ${className}`.trim()}
      {...props}
    />
  );
});

Button.displayName = 'Button';

export default Button;
