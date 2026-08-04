// Single source of truth for the official customer-support address. The literal
// lives in lib/supportContact.json — JSON because the value is needed on both
// sides of the fence: server.js (CommonJS) injects it into the public
// public/pricing.html sales page, and this module hands it to the React app.
// Never re-type the address in a component; import from here.
import { supportEmail } from '../../lib/supportContact.json';

export const SUPPORT_EMAIL: string = supportEmail;
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
