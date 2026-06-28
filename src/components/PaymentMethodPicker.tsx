import React from 'react';
import type { PaymentProvider } from '../services/api';

// Two Taiwanese gateways offered side by side. Keep the sub-labels aligned with
// what each gateway is actually configured to accept (lib/ecpay.js ChoosePayment
// = ALL; lib/newebpay.js CREDIT/WEBATM/VACC/CVS/BARCODE).
const OPTIONS: { id: PaymentProvider; label: string; sub: string }[] = [
  { id: 'ecpay', label: '綠界 ECPay', sub: '信用卡 · LINE Pay' },
  { id: 'newebpay', label: '藍新金流', sub: '信用卡 · ATM · 超商' },
];

interface Props {
  value: PaymentProvider;
  onChange: (p: PaymentProvider) => void;
  disabled?: boolean;
}

// Radio-group of payment gateways. Used wherever a checkout starts (Premium
// upgrade + paid video sessions) so the choice looks and behaves the same.
const PaymentMethodPicker: React.FC<Props> = ({ value, onChange, disabled }) => (
  <div role="radiogroup" aria-label="付款方式" className="grid grid-cols-2 gap-2">
    {OPTIONS.map((o) => {
      const active = value === o.id;
      return (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={active}
          disabled={disabled}
          onClick={() => onChange(o.id)}
          data-testid={`payment-provider-${o.id}`}
          className={`rounded-md border px-3 py-2.5 text-center transition-colors disabled:opacity-50 ${
            active
              ? 'border-petal-ink bg-petal-cream-2'
              : 'border-petal-rule bg-petal-cream hover:border-petal-ink'
          }`}
        >
          <div className="font-body text-sm font-medium text-petal-ink">{o.label}</div>
          <div className="font-body text-[11px] text-petal-muted mt-0.5">{o.sub}</div>
        </button>
      );
    })}
  </div>
);

export default PaymentMethodPicker;
