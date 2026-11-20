export function BrandMark({ className = 'size-6' }: { readonly className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" className="fill-accent" />
      <path
        d="M11 14V11.5C11 8.73858 13.2386 6.5 16 6.5C18.7614 6.5 21 8.73858 21 11.5V14"
        className="stroke-accent-foreground"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <rect x="8.5" y="13.5" width="15" height="11.5" rx="2.5" className="fill-accent-foreground" />
      <circle cx="16" cy="18.6" r="1.7" className="fill-accent" />
      <path d="M16 20V22.2" className="stroke-accent" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
