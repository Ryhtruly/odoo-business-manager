import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', className = '', ...props }) => {
  let btnClass = 'btn';

  if (variant === 'primary') btnClass += ' btn-primary';
  else if (variant === 'secondary') btnClass += ' btn-secondary';
  else if (variant === 'accent') btnClass += ' btn-accent';
  else if (variant === 'danger') btnClass += ' btn-danger';

  if (size === 'sm') btnClass += ' btn-sm';
  else if (size === 'icon') btnClass += ' btn-icon';

  return <button className={`${btnClass} ${className}`} {...props} />;
};

export default Button;
