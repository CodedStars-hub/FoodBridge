import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function AuthField({
  label,
  name,
  error,
  hint,
  type = 'text',
  ...props
}) {
  const [visible, setVisible] = useState(false);
  const password = type === 'password';
  return (
    <div className="auth-field">
      <label htmlFor={`auth-${name}`}>{label}</label>
      <div
        className={`auth-input-wrap${password ? ' auth-input-password' : ''}`}
      >
        <input
          id={`auth-${name}`}
          name={name}
          type={password && visible ? 'text' : type}
          aria-invalid={!!error}
          aria-describedby={
            error
              ? `auth-${name}-error`
              : hint
                ? `auth-${name}-hint`
                : undefined
          }
          {...props}
        />
        {password && (
          <button
            type="button"
            className="auth-password-toggle"
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            aria-controls={`auth-${name}`}
            disabled={props.disabled}
            onClick={() => setVisible(!visible)}
          >
            {visible ? (
              <EyeOff size={19} aria-hidden="true" />
            ) : (
              <Eye size={19} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {error ? (
        <span id={`auth-${name}-error`} className="auth-field-error">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`auth-${name}-hint`} className="auth-field-hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}
