import React, { useCallback, useEffect, useState } from 'react';
import { Receipt, Printer } from 'lucide-react';
import { apiService, type PaymentOrderRecord, type PaymentReceipt } from '../services/api';

type Notify = (n: { type: 'success' | 'error' | 'info' | 'warning'; title: string; message: string; duration?: number }) => void;

interface PurchaseReceiptsProps {
  showNotification?: Notify;
  // Sample mode renders a fixed illustrative row without touching the API —
  // used by the logged-out showroom.
  sample?: boolean;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const PROVIDER_LABEL: Record<string, string> = {
  ecpay: '綠界 ECPay',
  newebpay: '藍新金流 NewebPay',
};

const SAMPLE_ORDER: PaymentOrderRecord = {
  orderNo: 'TGMSAMPLE001',
  source: 'premium',
  itemLabel: 'Twogether Premium 90 天',
  amount: 240,
  status: 'paid',
  provider: 'newebpay',
  paymentMethod: 'CREDIT',
  createdAt: '2026-08-01T10:12:00+08:00',
  paidAt: '2026-08-01T10:13:00+08:00',
  receiptNo: 'TG-20260801-A1B2C3',
  receiptIssuedAt: '2026-08-01T10:13:00+08:00',
  invoiceNo: null,
};

// The issued document, laid out as an actual receipt. #receipt-print-area is
// what the print stylesheet in index.css isolates, so this markup is also the
// printed/PDF output — keep it self-contained (seller, buyer, item, amount).
const ReceiptDocument: React.FC<{ receipt: PaymentReceipt }> = ({ receipt }) => {
  const rows: [string, string][] = [
    ['收據編號', receipt.receiptNo],
    ['開立日期', formatDateTime(receipt.issuedAt)],
    ['品項', receipt.itemLabel],
    ['金額', `NT$ ${receipt.amount}`],
    ['付款方式', receipt.provider ? PROVIDER_LABEL[receipt.provider] || receipt.provider : '—'],
    ...(receipt.tradeNo ? ([['金流交易序號', receipt.tradeNo]] as [string, string][]) : []),
    ...(receipt.buyerTitle ? ([['抬頭', receipt.buyerTitle]] as [string, string][]) : []),
    ...(receipt.buyerTaxId ? ([['統一編號', receipt.buyerTaxId]] as [string, string][]) : []),
    ...(receipt.buyerEmail ? ([['購買人信箱', receipt.buyerEmail]] as [string, string][]) : []),
    ...(receipt.invoiceNo ? ([['發票號碼', receipt.invoiceNo]] as [string, string][]) : []),
  ];

  return (
    <div className="p-7" data-testid="receipt-document">
      <div className="text-center border-b border-petal-rule pb-5 mb-5">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-petal-muted mb-2">
          — 電子收據
        </div>
        <h3 className="font-display text-2xl font-light text-petal-ink">Twogether</h3>
        <p className="font-body text-xs text-petal-muted mt-1">
          開立人：{receipt.sellerName}
          {receipt.sellerTaxId ? `（統編 ${receipt.sellerTaxId}）` : ''}
        </p>
      </div>

      <dl className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 py-1.5 border-b border-petal-rule/50">
            <dt className="font-body text-xs text-petal-muted shrink-0">{k}</dt>
            <dd className="font-body text-sm text-petal-ink text-right break-all">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 font-body text-[11px] text-petal-muted leading-relaxed">
        {receipt.invoiceNo
          ? '本收據對應之統一發票號碼如上，發票依電子發票規定另行寄送。'
          : '本服務目前由個人賣家經營，尚未辦理稅籍登記，依法不開立統一發票，本收據為本次交易之付款證明。完成稅籍登記後將改以電子發票開立。'}
        <br />
        如有任何交易問題，請聯絡 {receipt.sellerContact}。
      </p>
    </div>
  );
};

const ReceiptModal: React.FC<{ receipt: PaymentReceipt; onClose: () => void }> = ({ receipt, onClose }) => {
  // Tag the body while the modal is open so the print stylesheet knows to
  // isolate the receipt; removing it on unmount keeps normal printing intact.
  useEffect(() => {
    document.body.classList.add('printing-receipt');
    return () => document.body.classList.remove('printing-receipt');
  }, []);

  return (
    <div
      className="fixed inset-0 bg-petal-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      data-testid="receipt-modal"
    >
      <div
        id="receipt-print-area"
        className="bg-petal-cream rounded-md shadow-petal max-w-md w-full max-h-[90vh] overflow-y-auto overscroll-contain border border-petal-rule"
      >
        <ReceiptDocument receipt={receipt} />
        <div className="receipt-no-print flex gap-2 px-7 pb-7">
          <button
            onClick={() => window.print()}
            data-testid="receipt-print-button"
            className="flex-1 py-2.5 rounded-md bg-petal-ink text-petal-cream hover:bg-pink-700 transition-colors font-display italic text-sm flex items-center justify-center gap-1.5"
          >
            <Printer className="w-4 h-4" strokeWidth={1.5} />
            列印／存成 PDF
          </button>
          <button
            onClick={onClose}
            data-testid="receipt-close-button"
            className="px-5 py-2.5 rounded-md border border-petal-rule text-petal-ink-soft hover:border-petal-ink transition-colors font-display italic text-sm"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};

// "購買紀錄與收據": every paid transaction this buyer made (Premium passes and
// paid therapist sessions), each with the electronic receipt issued for it.
const PurchaseReceipts: React.FC<PurchaseReceiptsProps> = ({ showNotification, sample = false }) => {
  const [orders, setOrders] = useState<PaymentOrderRecord[]>(sample ? [SAMPLE_ORDER] : []);
  const [loading, setLoading] = useState(!sample);
  const [openReceipt, setOpenReceipt] = useState<PaymentReceipt | null>(null);
  const [fetchingNo, setFetchingNo] = useState<string | null>(null);

  useEffect(() => {
    if (sample) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await apiService.getBillingOrders();
        if (!cancelled) setOrders(list);
      } catch (err) {
        if (!cancelled) {
          showNotification?.({
            type: 'error',
            title: '無法載入購買紀錄',
            message: (err as Error)?.message || '請稍後再試，或聯絡客服協助查詢',
            duration: 5000,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sample, showNotification]);

  const openReceiptFor = useCallback(
    async (receiptNo: string) => {
      if (sample) return;
      setFetchingNo(receiptNo);
      try {
        setOpenReceipt(await apiService.getReceipt(receiptNo));
      } catch (err) {
        showNotification?.({
          type: 'error',
          title: '無法開啟收據',
          message: (err as Error)?.message || '請稍後再試，或聯絡客服協助補發',
          duration: 5000,
        });
      } finally {
        setFetchingNo(null);
      }
    },
    [sample, showNotification]
  );

  return (
    <div className="rounded-md border border-petal-rule bg-petal-cream p-5" data-testid="purchase-receipts">
      <div className="flex items-center space-x-2 mb-3">
        <Receipt className="w-4 h-4 text-pink-600" strokeWidth={1.5} />
        <span className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-petal-muted">
          購買紀錄與收據
        </span>
      </div>

      {loading ? (
        <p className="font-body text-sm text-petal-muted py-3">載入中…</p>
      ) : orders.length === 0 ? (
        // Empty state as mini-onboarding (docs/UX_PLAYBOOK.md): what it's for,
        // then what to do — not a bare "沒有資料".
        <div data-testid="purchase-receipts-empty">
          <p className="font-display italic font-light text-sm text-petal-ink-soft leading-relaxed mb-1">
            還沒有付款紀錄。升級 Premium 之後，每一筆交易都會在這裡留下一張電子收據，隨時可以查看或列印報帳。
          </p>
          <p className="font-body text-xs text-petal-muted">
            選擇上方任一方案即可開始，付款完成後收據也會寄到你的信箱。
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-petal-rule/60">
          {orders.map((o) => (
            <li key={o.orderNo} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-sm text-petal-ink truncate">{o.itemLabel}</div>
                <div className="font-body text-xs text-petal-muted">
                  NT${o.amount} · {formatDateTime(o.paidAt || o.createdAt)}
                  {o.status !== 'paid' && (
                    <span className="ml-1 text-petal-sage-deep">
                      （{o.status === 'pending' ? '未完成付款' : '付款失敗'}）
                    </span>
                  )}
                </div>
              </div>
              {o.receiptNo ? (
                <button
                  onClick={() => openReceiptFor(o.receiptNo as string)}
                  disabled={fetchingNo === o.receiptNo}
                  data-testid={`receipt-open-${o.orderNo}`}
                  className="shrink-0 px-3 py-1.5 rounded-md border border-petal-rule text-petal-ink-soft hover:border-petal-ink transition-colors font-body text-xs disabled:opacity-60"
                >
                  {fetchingNo === o.receiptNo ? '開啟中…' : '查看收據'}
                </button>
              ) : (
                <span className="shrink-0 font-body text-xs text-petal-muted">
                  {o.status === 'paid' ? '收據處理中' : '未開立'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {openReceipt && <ReceiptModal receipt={openReceipt} onClose={() => setOpenReceipt(null)} />}
    </div>
  );
};

export default PurchaseReceipts;
export { ReceiptDocument };
