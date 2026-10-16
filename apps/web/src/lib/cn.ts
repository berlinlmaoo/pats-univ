import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge our token names so `text-body-sm` overrides `text-body` (font size)
// instead of being mistaken for a colour.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'title1', 'title2', 'title3', 'body-lg', 'body', 'body-sm', 'caption', 'label'],
      radius: ['control', 'card'],
      shadow: ['soft', 'pop'],
    },
  },
});

/** Joins class names (skipping falsy values); later classes win over conflicting earlier ones. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return merge(parts.filter(Boolean).join(' '));
}
