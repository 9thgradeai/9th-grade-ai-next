/**
 * Input Components
 * TextInput, Textarea, Select, Checkbox, Radio, Switch with full accessibility.
 */

import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ChangeEvent, FocusEvent, useId } from 'react';
import { motion } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// TEXT INPUT
// ─────────────────────────────────────────────────────────────────────────────

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label text */
  label?: string;
  /** Helper/hint text */
  hint?: string;
  /** Error message */
  error?: string;
  /** Left addon */
  leftAddon?: React.ReactNode;
  /** Right addon */
  rightAddon?: React.ReactNode;
  /** Input size */
  size?: 'sm' | 'md' | 'lg';
  /** Full width */
  fullWidth?: boolean;
  /** Disable animation */
  disableAnimation?: boolean;
}

const inputSizeStyles: Record<NonNullable<TextInputProps['size']>, string> = {
  sm: 'px-3 py-2 text-sm min-h-[40px]',
  md: 'px-4 py-2.5 text-[13px] min-h-[44px]',
  lg: 'px-5 py-3 text-base min-h-[48px]',
};

const addonSizeStyles: Record<NonNullable<TextInputProps['size']>, string> = {
  sm: 'px-3',
  md: 'px-4',
  lg: 'px-5',
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      label,
      hint,
      error,
      leftAddon,
      rightAddon,
      size = 'md',
      fullWidth = false,
      disableAnimation = false,
      className = '',
      id,
      disabled,
      required,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref
  ) => {
    const uid = useId();
    const inputId = id || `input-${uid}`;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = [hintId, errorId, ariaDescribedBy].filter(Boolean).join(' ') || undefined;

    const hasError = Boolean(error);

    const wrapperStyles = [
      'relative flex flex-col gap-1.5',
      fullWidth ? 'w-full' : '',
    ].filter(Boolean).join(' ');

    const inputWrapperStyles = [
      'relative flex items-center',
      'rounded-xl',
      'bg-[var(--input-bg)]',
      'border',
      'transition-all duration-150 ease-out',
      !disableAnimation && 'focus-within:ring-2 focus-within:ring-[var(--focus-ring)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--surface-base)]',
      hasError
        ? 'border-[var(--danger)] focus-within:ring-[var(--danger)]'
        : 'border-[var(--input-border)] focus-within:border-[var(--input-focus)]',
      disabled && 'opacity-50 cursor-not-allowed',
      inputSizeStyles[size],
    ].filter(Boolean).join(' ');

    const addonStyles = [
      'flex items-center justify-center',
      'text-[var(--text-muted)]',
      'bg-[var(--surface-muted)]',
      'border border-[var(--input-border)]',
      addonSizeStyles[size],
    ].join(' ');

    return (
      <div className={wrapperStyles}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            {label}
            {required && <span className="text-[var(--danger)] ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <div className={inputWrapperStyles}>
          {leftAddon && (
            <div
              className={[
                addonStyles,
                'rounded-l-xl rounded-r-none',
                'border-r',
              ].join(' ')}
              aria-hidden="true"
            >
              {leftAddon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            required={required}
            aria-describedby={describedBy}
            aria-invalid={hasError || ariaInvalid}
            className={[
              'flex-1 w-full min-w-0',
              'bg-transparent',
              'text-[var(--text-primary)]',
              'placeholder:text-[var(--input-placeholder)]',
              'focus:outline-none',
              'disabled:cursor-not-allowed',
              leftAddon ? 'rounded-l-none' : 'rounded-l-xl',
              rightAddon ? 'rounded-r-none' : 'rounded-r-xl',
              'py-0', // vertical padding handled by wrapper
            ].join(' ')}
            {...props}
          />
          {rightAddon && (
            <div
              className={[
                addonStyles,
                'rounded-r-xl rounded-l-none',
                'border-l',
              ].join(' ')}
              aria-hidden="true"
            >
              {rightAddon}
            </div>
          )}
        </div>
        {error && (
          <motion.p
            id={errorId}
            className="text-xs font-medium text-[var(--danger)] flex items-center gap-1"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            role="alert"
          >
            <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </motion.p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-xs text-[var(--text-muted)]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

TextInput.displayName = 'TextInput';

// ─────────────────────────────────────────────────────────────────────────────
// TEXTAREA
// ─────────────────────────────────────────────────────────────────────────────

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  rows?: number;
  resize?: 'none' | 'vertical' | 'horizontal' | 'both';
  showCharCount?: boolean;
  maxLength?: number;
}

const textareaSizeStyles: Record<NonNullable<TextareaProps['size']>, string> = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2.5 text-[13px]',
  lg: 'px-5 py-3 text-base',
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      hint,
      error,
      size = 'md',
      fullWidth = false,
      rows = 4,
      resize = 'vertical',
      showCharCount = false,
      maxLength,
      className = '',
      id,
      disabled,
      required,
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const uid = useId();
    const textareaId = id || `textarea-${uid}`;
    const hintId = hint ? `${textareaId}-hint` : undefined;
    const errorId = error ? `${textareaId}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

    const hasError = Boolean(error);
    const charCount = typeof value === 'string' ? value.length : 0;

    return (
      <div className={['relative flex flex-col gap-1.5', fullWidth ? 'w-full' : ''].join(' ')}>
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            {label}
            {required && <span className="text-[var(--danger)] ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <div className="relative">
          <textarea
            ref={ref}
            id={textareaId}
            disabled={disabled}
            required={required}
            aria-describedby={describedBy}
            aria-invalid={hasError}
            rows={rows}
            maxLength={maxLength}
            value={value}
            onChange={onChange}
            style={{ resize }}
            className={[
              'w-full rounded-xl',
              'bg-[var(--input-bg)]',
              'border',
              'text-[var(--text-primary)]',
              'placeholder:text-[var(--input-placeholder)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-2 focus:ring-offset-[var(--surface-base)]',
              'transition-all duration-150 ease-out',
              hasError
                ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]'
                : 'border-[var(--input-border)] focus:border-[var(--input-focus)]',
              disabled && 'opacity-50 cursor-not-allowed',
              textareaSizeStyles[size],
              className,
            ].join(' ')}
            {...props}
          />
          {(showCharCount || maxLength) && (
            <div className="absolute bottom-2 right-2 text-xs font-mono" aria-hidden="true">
              <span className={charCount > (maxLength || Infinity) ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}>
                {charCount}
              </span>
              {maxLength && <span className="text-[var(--text-muted)]"> / {maxLength}</span>}
            </div>
          )}
        </div>
        {error && (
          <motion.p
            id={errorId}
            className="text-xs font-medium text-[var(--danger)] flex items-center gap-1"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </motion.p>
        )}
        {hint && !error && <p id={hintId} className="text-xs text-[var(--text-muted)]">{hint}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

// ─────────────────────────────────────────────────────────────────────────────
// SELECT
// ─────────────────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  searchable?: boolean; // Not implemented in native select
}

const selectSizeStyles: Record<NonNullable<SelectProps['size']>, string> = {
  sm: 'px-3 py-2 text-sm min-h-[40px] pr-10',
  md: 'px-4 py-2.5 text-[13px] min-h-[44px] pr-10',
  lg: 'px-5 py-3 text-base min-h-[48px] pr-10',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      hint,
      error,
      options,
      placeholder,
      size = 'md',
      fullWidth = false,
      className = '',
      id,
      disabled,
      required,
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const uid = useId();
    const selectId = id || `select-${uid}`;
    const hintId = hint ? `${selectId}-hint` : undefined;
    const errorId = error ? `${selectId}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

    const hasError = Boolean(error);

    // Group options by group prop
    const groupedOptions = options.reduce((acc, opt) => {
      const group = opt.group || 'ungrouped';
      if (!acc[group]) acc[group] = [];
      acc[group].push(opt);
      return acc;
    }, {} as Record<string, SelectOption[]>);

    return (
      <div className={['relative flex flex-col gap-1.5', fullWidth ? 'w-full' : ''].join(' ')}>
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            {label}
            {required && <span className="text-[var(--danger)] ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            required={required}
            aria-describedby={describedBy}
            aria-invalid={hasError}
            value={value}
            onChange={onChange}
            className={[
              'w-full appearance-none rounded-xl',
              'bg-[var(--input-bg)]',
              'border',
              'text-[var(--text-primary)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-2 focus:ring-offset-[var(--surface-base)]',
              'transition-all duration-150 ease-out',
              hasError
                ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-[var(--danger)]'
                : 'border-[var(--input-border)] focus:border-[var(--input-focus)]',
              disabled && 'opacity-50 cursor-not-allowed',
              selectSizeStyles[size],
              className,
            ].join(' ')}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {Object.entries(groupedOptions).map(([group, opts]) =>
              group !== 'ungrouped' ? (
                <optgroup key={group} label={group}>
                  {opts.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ) : (
                opts.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              )
            )}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" aria-hidden="true">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {error && (
          <motion.p
            id={errorId}
            className="text-xs font-medium text-[var(--danger)] flex items-center gap-1"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </motion.p>
        )}
        {hint && !error && <p id={hintId} className="text-xs text-[var(--text-muted)]">{hint}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';

// ─────────────────────────────────────────────────────────────────────────────
// CHECKBOX
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  indeterminate?: boolean;
}

const checkboxSizeStyles: Record<NonNullable<CheckboxProps['size']>, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

const checkboxLabelStyles: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-sm',
  md: 'text-[13px]',
  lg: 'text-base',
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      description,
      size = 'md',
      indeterminate = false,
      className = '',
      id,
      disabled,
      required,
      checked,
      onChange,
      ...props
    },
    ref
  ) => {
    const uid = useId();
    const checkboxId = id || `checkbox-${uid}`;

    const checkboxStyles = [
      'relative flex-shrink-0',
      'rounded-md',
      'border-2',
      'transition-all duration-150 ease-out',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2',
      'cursor-pointer',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      checked
        ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--text-inverse)]'
        : indeterminate
          ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--text-inverse)]'
          : 'bg-[var(--input-bg)] border-[var(--input-border)] text-transparent',
      checkboxSizeStyles[size],
      className,
    ].join(' ');

    return (
      <div className="flex items-start gap-3">
        <div className="flex items-center">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            checked={checked}
            disabled={disabled}
            required={required}
            onChange={onChange}
            aria-checked={indeterminate ? 'mixed' : checked}
            className="sr-only"
            {...props}
          />
          <div
            className={checkboxStyles}
            aria-hidden="true"
          >
            {checked && (
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
            {indeterminate && !checked && (
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 011-1h.01a1 1 0 110 2H11a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </div>
        {(label || description) && (
          <div className="min-w-0">
            {label && (
              <label
                htmlFor={checkboxId}
                className={[
                  'font-medium cursor-pointer select-none',
                  checkboxLabelStyles[size],
                  disabled && 'opacity-50 cursor-not-allowed',
                ].join(' ')}
              >
                {label}
              </label>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
            )}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

// ─────────────────────────────────────────────────────────────────────────────
// RADIO
// ─────────────────────────────────────────────────────────────────────────────

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
}

const radioSizeStyles: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  (
    {
      label,
      description,
      size = 'md',
      className = '',
      id,
      name,
      disabled,
      required,
      checked,
      onChange,
      value,
      ...props
    },
    ref
  ) => {
    const uid = useId();
    const radioId = id || `radio-${uid}`;

    const radioStyles = [
      'relative flex-shrink-0',
      'rounded-full',
      'border-2',
      'transition-all duration-150 ease-out',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2',
      'cursor-pointer',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      checked
        ? 'border-[var(--primary)] bg-[var(--surface-base)]'
        : 'border-[var(--input-border)] bg-[var(--input-bg)]',
      radioSizeStyles[size],
      className,
    ].join(' ');

    return (
      <div className="flex items-start gap-3">
        <div className="flex items-center">
          <input
            ref={ref}
            type="radio"
            id={radioId}
            name={name}
            value={value}
            checked={checked}
            disabled={disabled}
            required={required}
            onChange={onChange}
            className="sr-only"
            {...props}
          />
          <div className={radioStyles} aria-hidden="true">
            {checked && (
              <div
                className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 w-1/2 h-1/2 rounded-full bg-[var(--primary)]"
                aria-hidden="true"
              />
            )}
          </div>
        </div>
        {(label || description) && (
          <div className="min-w-0">
            {label && (
              <label
                htmlFor={radioId}
                className={[
                  'font-medium cursor-pointer select-none',
                  checkboxLabelStyles[size],
                  disabled && 'opacity-50 cursor-not-allowed',
                ].join(' ')}
              >
                {label}
              </label>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
            )}
          </div>
        )}
      </div>
    );
  }
);

Radio.displayName = 'Radio';

// ─────────────────────────────────────────────────────────────────────────────
// RADIO GROUP
// ─────────────────────────────────────────────────────────────────────────────

export interface RadioGroupProps {
  name: string;
  label?: string;
  description?: string;
  options: { value: string; label: string; description?: string; disabled?: boolean }[];
  value?: string;
  onChange?: (value: string) => void;
  orientation?: 'horizontal' | 'vertical';
  size?: 'sm' | 'md' | 'lg';
  required?: boolean;
  className?: string;
}

export function RadioGroup({
  name,
  label,
  description,
  options,
  value,
  onChange,
  orientation = 'vertical',
  size = 'md',
  required,
  className = '',
}: RadioGroupProps) {
  const uid = useId();
  const groupId = `radiogroup-${uid}`;
  const descriptionId = description ? `${groupId}-description` : undefined;

  return (
    <fieldset className={['flex flex-col gap-3', className].join(' ')} aria-describedby={descriptionId}>
      {(label || description) && (
        <div>
          {label && <legend className="text-sm font-medium text-[var(--text-primary)]">{label}</legend>}
          {description && <p id={descriptionId} className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>}
        </div>
      )}
      <div
        className={[
          'flex gap-4',
          orientation === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col',
        ].join(' ')}
        role="radiogroup"
        aria-label={label}
        aria-required={required}
      >
        {options.map((option) => (
          <Radio
            key={option.value}
            id={`${groupId}-${option.value}`}
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange?.(option.value)}
            disabled={option.disabled}
            required={required}
            label={option.label}
            description={option.description}
            size={size}
          />
        ))}
      </div>
    </fieldset>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SWITCH
// ─────────────────────────────────────────────────────────────────────────────

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
}

const switchSizeStyles: Record<'sm' | 'md' | 'lg', { track: string; thumb: string }> = {
  sm: { track: 'w-8 h-4', thumb: 'w-3 h-3 translate-x-0.5' },
  md: { track: 'w-11 h-6', thumb: 'w-5 h-5 translate-x-0.5' },
  lg: { track: 'w-14 h-7', thumb: 'w-6 h-6 translate-x-0.5' },
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  (
    {
      label,
      description,
      size = 'md',
      className = '',
      id,
      disabled,
      required,
      checked,
      onChange,
      ...props
    },
    ref
  ) => {
    const uid = useId();
    const switchId = id || `switch-${uid}`;
    const { track, thumb } = switchSizeStyles[size];

    const trackStyles = [
      'relative flex-shrink-0 rounded-full',
      'transition-colors duration-200 ease-out',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2',
      checked
        ? 'bg-[var(--primary)]'
        : 'bg-[var(--input-border)]',
      disabled && 'opacity-50 cursor-not-allowed',
      track,
    ].join(' ');

    const thumbStyles = [
      'absolute top-1/2 rounded-full bg-white shadow-lg',
      'transform transition-transform duration-200 ease-out-expo',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2',
      checked ? 'translate-x-full -translate-y-1/2' : '-translate-y-1/2',
      thumb,
    ].join(' ');

    return (
      <div className="flex items-start gap-3">
        <div className="flex items-center">
          <input
            ref={ref}
            type="checkbox"
            id={switchId}
            checked={checked}
            disabled={disabled}
            required={required}
            onChange={onChange}
            className="sr-only"
            {...props}
          />
          <div
            className={trackStyles}
            role="switch"
            aria-checked={checked}
            aria-disabled={disabled}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChange?.({ target: { checked: !checked } } as any);
              }
            }}
          >
            <span className={thumbStyles} aria-hidden="true" />
          </div>
        </div>
        {(label || description) && (
          <div className="min-w-0">
            {label && (
              <label
                htmlFor={switchId}
                className={[
                  'font-medium cursor-pointer select-none',
                  checkboxLabelStyles[size],
                  disabled && 'opacity-50 cursor-not-allowed',
                ].join(' ')}
              >
                {label}
              </label>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
            )}
          </div>
        )}
      </div>
    );
  }
);

Switch.displayName = 'Switch';

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
// Types are exported at their declaration sites above.

export type {};