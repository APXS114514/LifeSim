import type { ReactNode } from 'react';
import type { FactCategory } from './fact-category.ts';

const paths: Record<FactCategory, ReactNode> = {
  life: (
    <>
      <path d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z" />
    </>
  ),
  family: (
    <>
      <circle cx="9" cy="8" r="2.6" />
      <circle cx="16.5" cy="9.5" r="2" />
      <path d="M4.5 19c.4-3 2.2-4.6 4.5-4.6s4.1 1.6 4.5 4.6" />
      <path d="M14.5 19c.2-2.1 1.2-3.4 2.8-3.4 1.7 0 2.9 1.3 3.2 3.4" />
    </>
  ),
  education: (
    <>
      <path d="M4 7.5 12 4l8 3.5-8 3.5-8-3.5Z" />
      <path d="M7 10v4.2c0 1.3 2.2 2.3 5 2.3s5-1 5-2.3V10" />
      <path d="M20 8v5" />
    </>
  ),
  career: (
    <>
      <rect x="3.5" y="7.5" width="17" height="11.5" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M3.5 12.5h17" />
    </>
  ),
  finance: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v9M14.8 9.4c-.5-.8-1.5-1.2-2.8-1.2-1.6 0-2.6.8-2.6 1.9 0 2.6 5.4 1.4 5.4 4 0 1.2-1.1 1.9-2.8 1.9-1.4 0-2.4-.5-3-1.3" />
    </>
  ),
  health: (
    <>
      <path d="M3 12h3.5l1.8-4 3.2 8 2.2-4H21" />
    </>
  ),
  history: (
    <>
      <path d="M4 20h16M6 20V9M18 20V9M4 9h16L12 4 4 9Z" />
      <path d="M9.5 20v-6h5v6" />
    </>
  ),
  decision: (
    <>
      <path d="M6 4v6a3 3 0 0 0 3 3h9" />
      <path d="m15 10 3 3-3 3" />
      <path d="M6 20v-3" />
      <circle cx="6" cy="3" r="1.4" />
    </>
  ),
  other: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </>
  ),
};

/** 原创线条图标，24×24，只跟随 currentColor；不使用任何外部素材。 */
export function FactIcon({ category }: { category: FactCategory }) {
  return (
    <svg
      className="fact-icon-svg"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[category]}
    </svg>
  );
}
