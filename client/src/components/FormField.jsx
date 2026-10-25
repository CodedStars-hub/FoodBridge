export default function FormField({ label, name, error, hint, ...props }) {
  return (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${name}-error` : hint ? `${name}-hint` : undefined
        }
        {...props}
      />
      {hint && !error && (
        <span id={`${name}-hint`} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${name}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
