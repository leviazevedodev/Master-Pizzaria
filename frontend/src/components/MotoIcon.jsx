import React from "react";

export default function MotoIcon({
  size = 24,
  strokeWidth = 1.8,
  className = "",
  ...props
}) {
  const s = Number(size) || 24;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="5.5" cy="17.5" r="2.6" />
      <circle cx="18.5" cy="17.5" r="2.6" />
      <path d="M8.1 17.5h3.1l2.35-4.65h3.3l1.65 2.15" />
      <path d="M11.2 17.5 9.15 12.9H6.7" />
      <path d="M9.15 12.9h4.55l-1.1-2.35H9.65" />
      <path d="M13.7 12.85h3.1l1.65-3.25h2.15" />
      <path d="M18.45 9.6h2.35" />
      <path d="M7.7 10.55h5.05" />
      <path d="M7.4 10.55 6.3 8.85H4.65" />
      <path d="M14.85 10.55h1.85" />
      <path d="M3.45 14.75c.55-.5 1.25-.8 2.05-.8 1.15 0 2.15.62 2.68 1.55" />
      <path d="M15.82 15.45a3 3 0 0 1 2.68-1.5c.8 0 1.53.31 2.07.82" />
    </svg>
  );
}
