import React from 'react';
import type { PaymentProvider } from '../services/api';
import { tr } from '../i18n/tr';
import { PAYMENT_OPTIONS as OPTIONS } from '../utils/paymentProviders';

interface Props {
  value: PaymentProvider;
  onChange: (p: PaymentProvider) => void;
  disabled?: boolean;
}

// Radio-group of payment gateways. Used wherever a checkout starts (Premium
// upgrade + paid video sessions) so the choice looks and behaves the same.
const PaymentMethodPicker: React.FC<Props> = ({ value, onChange, disabled }) => (
  <div role="radiogroup" aria-label={tr("付款方式", 'Payment method')} className={`grid gap-2 ${OPTIONS.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
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
