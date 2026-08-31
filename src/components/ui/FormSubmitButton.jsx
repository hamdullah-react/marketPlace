'use client';

import { useFormStatus } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * React 19 Form Submit Button with useFormStatus
 * Automatically shows loading state during form submission
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Button content
 * @param {React.ReactNode} props.loadingChildren - Content to show while loading (optional)
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.disabled - Disabled state
 * @param {string} props.variant - Button variant: 'primary', 'secondary', 'danger'
 * @param {string} props.size - Button size: 'sm', 'md', 'lg'
 * @param {boolean} props.showSpinner - Show loading spinner (default: true)
 */
export function FormSubmitButton({
  children,
  loadingChildren,
  className = '',
  disabled = false,
  variant = 'primary',
  size = 'md',
  showSpinner = true,
  ...props
}) {
  // React 19 useFormStatus hook - provides pending state automatically
  const { pending } = useFormStatus();

  const baseStyles = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

  const variantStyles = {
    primary: 'bg-brand-primary hover:bg-brand-primary/90 text-white focus-visible:ring-brand-primary',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900 focus-visible:ring-gray-400',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-600',
  };

  const sizeStyles = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-11 px-4 text-base',
    lg: 'h-12 px-6 text-lg',
  };

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {pending && showSpinner && (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      )}
      {pending && loadingChildren ? loadingChildren : children}
    </button>
  );
}

/**
 * Form Action Button (for forms using Server Actions)
 * Similar to FormSubmitButton but optimized for Server Actions
 */
export function FormActionButton({ children, ...props }) {
  return (
    <FormSubmitButton {...props}>
      {children}
    </FormSubmitButton>
  );
}

export default FormSubmitButton;
