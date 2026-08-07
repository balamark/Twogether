// The accept URL for a pairing invite. Shared by the invite modal (which shows
// it right after sending) and the pairing reminder banner (which rebuilds it
// from /my-invitations on a later visit), so both hand the partner the exact
// same link.
export const buildPairingAcceptLink = (token: string): string =>
  `${window.location.origin}/pairing/accept?token=${encodeURIComponent(token)}`;
