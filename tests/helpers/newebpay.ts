// Dummy 藍新金流 (NewebPay) MPG credentials for the e2e suite, shared by
// playwright.config.ts (which hands them to the test server) and
// receipt-issuance.spec.ts (which signs callbacks with the same key the server
// verifies against). Mirrors the LINE test creds: with these set,
// newebpay.isConfigured() is true, so /billing/checkout builds a real encrypted
// payload instead of returning 503 NEWEBPAY_UNAVAILABLE.
//
// Never a real merchant secret — those only live in GitHub secrets → prod.
//
// NOT a *.spec.ts file, so Playwright's default testMatch never collects it.

export const TEST_NEWEBPAY = {
  merchantId: 'MS_E2E_TEST_SHOP',
  // AES-256-CBC: the key must be exactly 32 bytes and the IV exactly 16, or
  // crypto.createCipheriv throws when the first checkout is built.
  hashKey: '0123456789abcdef0123456789abcdef',
  hashIV: 'fedcba9876543210',
};
