import type { PaymentProvider } from '../services/api';
import { tr } from '../i18n/tr';

// Two Taiwanese gateways offered side by side. Keep the sub-labels aligned with
// what each gateway is actually configured to accept (lib/ecpay.js ChoosePayment
// = ALL; lib/newebpay.js CREDIT/WEBATM/VACC/CVS/BARCODE).
const ALL_OPTIONS: { id: PaymentProvider; label: string; sub: string }[] = [
  { id: 'ecpay', label: tr('綠界 ECPay', 'ECPay'), sub: tr('信用卡 · LINE Pay', 'Credit card · LINE Pay') },
  { id: 'newebpay', label: tr('藍新金流', 'NewebPay'), sub: tr('信用卡 · ATM · 超商', 'Credit card · ATM · convenience store') },
];

// 綠界 ECPay is hidden until its production merchant keys are set up. The
// server refuses it too (lib/ecpay.js isConfigured → ECPAY_UNAVAILABLE), so
// flipping this back on needs ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV
// in the deploy first.
const ECPAY_ENABLED = false;

export const PAYMENT_OPTIONS = ALL_OPTIONS.filter((o) => o.id !== 'ecpay' || ECPAY_ENABLED);

// Initial selection for every checkout screen.
export const DEFAULT_PAYMENT_PROVIDER: PaymentProvider = PAYMENT_OPTIONS[0].id;
