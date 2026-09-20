"use client";

import { forwardRef } from "react";

// Fixes two things that were previously handled ad hoc, differently, in
// every component that had an icon-only button: (1) the *clickable* area
// stops matching the *visible* icon size 1:1 - a 44x44 CSS px minimum hit
// area (WCAG 2.5.5/AAA, Apple HIG) regardless of how small the icon itself
// looks, and (2) icon sizing goes through one fixed scale instead of
// whatever pixel number felt right in a given file, so the same "medium"
// icon is always literally the same size everywhere.
//
// Usage: <IconButton icon={X} onClick={...} /> instead of
// <button onClick={...}><X size={18} /></button>. Anything else
// (className, aria-label, disabled, etc.) forwards straight to <button>.
const ICON_SIZES = {
  sm: 16,
  md: 20,
  lg: 24,
};

const IconButton = forwardRef(function IconButton(
  { icon: Icon, size = "md", className = "", iconClassName = "", ...props },
  ref
) {
  const iconSize = ICON_SIZES[size] || ICON_SIZES.md;

  return (
    <button
      ref={ref}
      type="button"
      className={`tap-target rounded-full transition-transform active:scale-90 ${className}`}
      {...props}
    >
      <Icon size={iconSize} className={iconClassName} />
    </button>
  );
});

export default IconButton;
