import type { Screen } from './types';
import activeScreens from './synced-screens.json';

// The registry contains metadata for real, implemented Admin routes only.
// Retired Ardot example screens are never loaded into production.
export const screens: readonly Screen[] = activeScreens as Screen[];

export function screenById(id: string): Screen {
  const screen = screens.find(item => item.id === id);
  if (!screen) throw new Error(`Unknown active ALSVID Admin screen: ${id}`);
  return screen;
}

export type { Screen } from './types';
