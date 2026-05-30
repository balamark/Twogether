import { createContext, useContext } from 'react';

// Holds the IANA timezone string used to render shared timestamps (intimacy
// invitations, events, wall posts, etc.). Populated from couple.primaryTimezone
// in App.tsx with a sensible browser-default fallback.
const TimezoneContext = createContext<string>('Asia/Taipei');

export const TimezoneProvider = TimezoneContext.Provider;

export function useTimezone(): string {
  return useContext(TimezoneContext);
}
