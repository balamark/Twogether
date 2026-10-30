import { useEffect, useRef, useState } from 'react';
import { Coins, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import DepositPanel from './DepositPanel';
import type { CoinGift, Notification } from '../App';
import { apiService } from '../services/api';
import { useCachedQuery, userKey } from '../services/queryCache';
import { tr } from '../i18n/tr';
import { newIdemKey } from '../utils/idempotency';

type GiftFields = Omit<CoinGift, 'id' | 'isCustom' | 'createdBy'>;

interface CoinShopViewProps {
  /** Built-in gifts still shown (removed/replaced ones already filtered out). */
  defaultGifts: CoinGift[];
  /** How many built-in gifts this couple removed — drives 恢復預設禮品. */
  hiddenDefaultCount: number;
  customGifts: CoinGift[];
  addCustomGift: (
    title: string,
    description: string,
    cost: number,
    category: CoinGift['category'],
    icon: string,
  ) => Promise<boolean>;
  updateGift: (gift: CoinGift, fields: GiftFields) => Promise<void>;
  removeGift: (gift: CoinGift) => Promise<void>;
  restoreDefaultGifts: () => Promise<void>;
  /** Keeps the header's 感情存款 chip in sync with the latest summary. */
  onBalanceChange: (balance: number) => void;
  onInvitePartner: () => void;
  showNotification: (notification: Omit<Notification, 'id'>) => void;
}

const EMPTY_GIFT: GiftFields = { title: '', description: '', cost: 1000, category: 'service', icon: '🎁' };

// Optimistically-added copies carry a temp id until the server answers; they
// can be redeemed but not edited/removed yet (there's no row to target).
const isPending = (gift: CoinGift) => gift.id.startsWith('temp-');

// 感情存款 page: both partners' deposit accounts (DepositPanel) plus the gift shop
// where you spend your own deposit on a gift from your partner — the partner
// has to agree before anything is deducted. Defined at module scope (not inside App) so its
// identity is stable across App re-renders — a nested definition would remount
// on every render and wipe the in-progress "add custom gift" form. See issue #41.
const CoinShopView = ({
  defaultGifts,
  hiddenDefaultCount,
  customGifts,
  addCustomGift,
  updateGift,
  removeGift,
  restoreDefaultGifts,
  onBalanceChange,
  onInvitePartner,
  showNotification,
}: CoinShopViewProps) => {
  const summaryQuery = useCachedQuery(userKey('/coins/summary'), () => apiService.getDepositSummary());
  const summary = summaryQuery.data;
  const paired = summary?.paired ?? false;
  const available = summary?.me.available ?? 0;
  const myBalance = summary?.me.balance;
  useEffect(() => {
    if (myBalance !== undefined) onBalanceChange(myBalance);
  }, [myBalance, onBalanceChange]);

  const [showAddGiftModal, setShowAddGiftModal] = useState(false);
  useScrollLock(showAddGiftModal);
  // null = adding a new gift; otherwise the gift being edited.
  const [editingGift, setEditingGift] = useState<CoinGift | null>(null);
  const [newGift, setNewGift] = useState<GiftFields>(EMPTY_GIFT);
  // Two-step remove (no blocking window.confirm): first tap arms it on that card.
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);

  const allGifts = [...defaultGifts, ...customGifts];

  const openAddModal = () => {
    setEditingGift(null);
    setNewGift(EMPTY_GIFT);
    setShowAddGiftModal(true);
  };

  const openEditModal = (gift: CoinGift) => {
    setConfirmingRemoveId(null);
    setEditingGift(gift);
    setNewGift({ title: gift.title, description: gift.description, cost: gift.cost, category: gift.category, icon: gift.icon });
    setShowAddGiftModal(true);
  };

  const closeModal = () => {
    setShowAddGiftModal(false);
    setEditingGift(null);
  };

  // Both actions mutate the coin balance / create records with no backend
  // idempotency key, so a double-click was a real duplicate-charge / duplicate-
  // gift risk. The ref lock in useAsyncAction closes that window.
  const { run: submitGift, pending: addingGift } = useAsyncAction(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (editingGift) {
        // Edits are optimistic (playbook §R7): the card updates now and App
        // rolls back + notifies if the save fails, so close right away.
        void updateGift(editingGift, newGift);
        closeModal();
        return;
      }
      const added = await addCustomGift(newGift.title, newGift.description, newGift.cost, newGift.category, newGift.icon);
      if (added) {
        setNewGift(EMPTY_GIFT);
        closeModal();
      }
    }
  );
  // Redeeming spends money, so it blocks (playbook §R7) — but it only sends a
  // request: the partner has to agree before the deposit is deducted. The
  // button is per card, so track which one is in flight; the hook's ref lock
  // drops a concurrent second click (same or other card).
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  // One idempotency key per gift (and price) that survives a lost response:
  // a retry after a timeout reuses it, so the server returns the redemption
  // it already created instead of reserving the amount a second time. The key
  // is dropped once the server has given a definitive answer.
  const redeemKeys = useRef(new Map<string, string>());
  const { run: buyGift } = useAsyncAction(async (gift: CoinGift) => {
    setPurchasingId(gift.id);
    const intent = `${gift.id}:${gift.cost}`;
    const key = redeemKeys.current.get(intent) ?? newIdemKey();
    redeemKeys.current.set(intent, key);
    try {
      await apiService.requestRedemption({ title: gift.title, icon: gift.icon, cost: gift.cost }, key);
      redeemKeys.current.delete(intent);
      showNotification({
        type: 'info',
        title: tr('已送出兌換申請 🎁', 'Redemption request sent 🎁'),
        message: tr(`等 TA 同意後，才會從你的感情存款扣除 ${gift.cost}`, `${gift.cost} is deducted from your Love Bank only after your partner agrees`),
        duration: 4000,
      });
    } catch (error) {
      const e = error as { message?: string; error_code?: string; status?: number };
      // No response at all: the request may have gone through. Keep the key
      // so a retry is deduped, and say "maybe sent" rather than inviting a
      // second request with a red error (playbook §R7).
      if (e?.error_code === 'TIMEOUT' || e?.error_code === 'NETWORK_ERROR') {
        showNotification({
          type: 'warning',
          title: tr('兌換申請可能已送出', 'Your redemption may have been sent'),
          message: tr('連線不穩，申請可能已經送出。請看「等待 TA 回應」確認；再按一次也不會重複申請。', 'The connection was unstable and the request may have gone through. Check "Waiting on your partner"; tapping again won\'t create a duplicate.'),
          duration: 6000,
        });
        return;
      }
      redeemKeys.current.delete(intent);
      const expected = e?.error_code === 'INSUFFICIENT_DEPOSIT' || e?.error_code === 'NOT_PAIRED';
      showNotification({
        type: expected ? 'warning' : 'error',
        title: tr('沒有送出兌換', 'Redemption not sent'),
        message: e?.message && !/^Request failed/.test(e.message) ? e.message : tr('兌換申請送出失敗，請稍後再試', 'Couldn\'t send the redemption request. Please try again in a moment'),
        duration: 6000,
      });
    } finally {
      setPurchasingId(null);
      await summaryQuery.refetch();
    }
  });

  return (
    <div className="space-y-10">
      <div className="border-b border-petal-rule pb-7">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
              {tr('— 感情存款', '— Love Bank')}
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
              {tr('感情', 'Love ')}<em className="not-italic font-light italic text-pink-600">{tr('存款', 'Bank')}</em>
            </h2>
            <p className="font-display italic font-light text-base text-petal-muted">
              {tr('只有另一半能為你存入感情存款；用自己的感情存款，兌換對方的心意。', 'Only your partner can add to your Love Bank; spend your own on a gift from them.')}
            </p>
          </div>
        </div>
      </div>

      <DepositPanel
        summary={summary}
        loading={summaryQuery.loading}
        error={summaryQuery.error}
        refresh={summaryQuery.refetch}
        onInvitePartner={onInvitePartner}
        showNotification={showNotification}
      />

      <div className="border-t border-petal-rule pt-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h3 className="font-display text-2xl font-medium tracking-tight text-petal-ink">
              {tr('用感情存款', 'Spend on a ')}<em className="not-italic font-light italic text-pink-600">{tr('兌換禮品', 'gift')}</em>
            </h3>
            <p className="font-body text-sm text-petal-muted mt-1">
              {tr('一起設計你們想要的禮品；兌換要等對方同意後才會扣款。', 'Design the gifts you both want; a redemption is deducted only after the other agrees.')}
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {hiddenDefaultCount > 0 && (
                <button
                  onClick={() => void restoreDefaultGifts()}
                  data-testid="restore-default-gifts"
                  className="px-4 py-1.5 rounded-full text-xs font-body text-petal-muted hover:text-petal-ink transition-colors flex items-center space-x-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{tr(`恢復預設禮品（${hiddenDefaultCount}）`, `Restore default gifts (${hiddenDefaultCount})`)}</span>
                </button>
              )}
              <button
                onClick={openAddModal}
                data-testid="add-gift-button"
                className="px-4 py-1.5 border border-petal-rule rounded-full text-xs font-body text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{tr('自訂禮品', 'Custom gift')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {allGifts.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-petal-rule p-8 text-center max-w-lg mx-auto" data-testid="gift-shop-empty">
          <div className="text-3xl mb-3">🎁</div>
          <p className="font-display text-lg text-petal-ink mb-2">
            {tr('把你們真正想要的小幸福放進商店', 'Fill the shop with the little joys you two actually want')}
          </p>
          <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-5">
            {tr('例如「💆 睡前肩頸按摩 · 800」——感情存款夠了，就兌換一份對方的心意。', 'For example "💆 A bedtime shoulder rub · 800": once your deposits add up, redeem a gesture from the other.')}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={openAddModal} className="rounded-full bg-petal-ink px-4 py-1.5 font-body text-[13px] font-medium text-petal-cream hover:bg-petal-ink/85 transition-colors">{tr('新增第一個禮品', 'Add your first gift')}</button>
            {hiddenDefaultCount > 0 && (
              <button
                onClick={() => void restoreDefaultGifts()}
                className="px-4 py-2 rounded-md text-sm font-body text-petal-ink-soft hover:text-petal-ink"
              >
                {tr('恢復預設禮品', 'Restore default gifts')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {allGifts.map((gift) => (
          <div key={gift.id} className="bg-white rounded-2xl border border-petal-rule p-6 hover:border-petal-rose transition-colors" data-testid="gift-card">
            <div className="mb-4 pb-4 border-b border-petal-rule-soft">
              <div className="flex items-start justify-between mb-3">
                <div className="text-2xl opacity-75 saturate-75">{gift.icon}</div>
                {!isPending(gift) && (
                  confirmingRemoveId === gift.id ? (
                    <div className="flex items-center gap-2 -mt-2 -mr-2 font-body text-xs">
                      <span className="text-petal-muted">{tr('確定移除？', 'Remove it?')}</span>
                      <button
                        onClick={() => { setConfirmingRemoveId(null); void removeGift(gift); }}
                        data-testid="confirm-remove-gift"
                        className="px-3 min-h-[44px] rounded-md bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        {tr('移除', 'Remove')}
                      </button>
                      <button
                        onClick={() => setConfirmingRemoveId(null)}
                        className="px-3 min-h-[44px] rounded-md text-petal-ink-soft hover:text-petal-ink"
                      >
                        {tr('取消', 'Cancel')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 -mt-2 -mr-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(gift)}
                        aria-label={tr(`修改「${gift.title}」`, `Edit "${gift.title}"`)}
                        title={tr('修改', 'Edit')}
                        data-testid="edit-gift"
                        className="p-2.5 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-md text-petal-muted hover:text-petal-ink hover:bg-petal-cream-2 transition-colors"
                      >
                        <Pencil className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                      <span aria-hidden className="w-px h-5 bg-petal-rule" />
                      <button
                        type="button"
                        onClick={() => setConfirmingRemoveId(gift.id)}
                        aria-label={tr(`移除「${gift.title}」`, `Remove "${gift.title}"`)}
                        title={tr('移除', 'Remove')}
                        data-testid="remove-gift"
                        className="p-2.5 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-md text-petal-muted hover:text-petal-rose-deep hover:bg-petal-cream-2 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  )
                )}
              </div>
              <h3 className="font-display text-lg font-medium tracking-tight text-petal-ink mb-1">{gift.title}</h3>
              <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{gift.description}</p>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted">
                {gift.category === 'service' ? tr('服務', 'Service') :
                 gift.category === 'experience' ? tr('體驗', 'Experience') :
                 gift.category === 'physical' ? tr('實物', 'Physical') : tr('親密', 'Intimate')}
              </span>
              <div className="font-display italic font-light text-base text-petal-ink">
                <Coins className="inline w-3.5 h-3.5 mr-1 text-petal-rose-deep" strokeWidth={1.5} />
                <b className="not-italic font-normal">{gift.cost}</b>
              </div>
            </div>

            {(() => {
              const canRedeem = paired && available >= gift.cost;
              const label = !summary
                ? (summaryQuery.error ? tr('暫時無法兌換', 'Can\'t redeem right now') : tr('讀取中…', 'Loading…'))
                : !paired
                ? tr('配對後才能兌換', 'Pair up to redeem')
                : purchasingId === gift.id
                  ? tr('送出中…', 'Sending…')
                  : canRedeem
                    ? tr('申請兌換 →', 'Ask to redeem →')
                    : tr(`感情存款還差 ${gift.cost - available}`, `${gift.cost - available} short`);
              return (
                <button
                  onClick={() => buyGift(gift)}
                  disabled={!canRedeem || purchasingId === gift.id}
                  data-testid="redeem-gift"
                  className={`w-full py-2.5 rounded-full border font-body text-[13px] font-medium transition-colors flex items-center justify-center gap-2 ${
                    canRedeem
                      ? 'bg-petal-rose-soft/25 border-petal-rose-soft text-petal-ink hover:border-petal-ink disabled:opacity-40 disabled:cursor-not-allowed'
                      : 'bg-petal-cream-2 border-transparent text-petal-muted cursor-not-allowed'
                  }`}
                >
                  {purchasingId === gift.id && <Spinner />}
                  {label}
                </button>
              );
            })()}
          </div>
        ))}
      </div>

      {/* Add Custom Gift Modal */}
      {showAddGiftModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-yellow-700">
                {editingGift ? tr('修改禮品', 'Edit gift') : tr('添加自訂禮品', 'Add a custom gift')}
              </h3>
              <button
                onClick={closeModal}
                aria-label={tr('關閉', 'Close')}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {editingGift && !editingGift.isCustom && (
              <p className="font-body text-xs text-petal-muted leading-relaxed mb-4">
                {tr('這是內建禮品，修改後會存成你們自己的版本；之後可隨時按「恢復預設禮品」找回原版。', 'This is a built-in gift. Your changes are saved as your own version; tap "Restore default gifts" anytime to bring the original back.')}
              </p>
            )}

            <form onSubmit={submitGift} className="space-y-4">
              <div>
                <label htmlFor="gift-title" className="block text-sm font-medium text-gray-700 mb-2">
                  {tr('禮品名稱', 'Gift name')}
                </label>
                <input
                  id="gift-title"
                  name="gift-title"
                  maxLength={100}
                  type="text"
                  value={newGift.title}
                  onChange={(e) => setNewGift(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                  placeholder={tr("例如：按摩服務", 'e.g. A massage')}
                  required
                />
              </div>

              <div>
                <label htmlFor="gift-description" className="block text-sm font-medium text-gray-700 mb-2">
                  {tr('描述', 'Description')}
                </label>
                <textarea
                  id="gift-description"
                  name="gift-description"
                  maxLength={500}
                  value={newGift.description}
                  onChange={(e) => setNewGift(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                  placeholder={tr("詳細描述這個禮品", 'Describe this gift in detail')}
                  rows={3}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="gift-cost" className="block text-sm font-medium text-gray-700 mb-2">
                    {tr('價格（感情存款）', 'Price (Love Bank)')}
                  </label>
                  <input
                    id="gift-cost"
                    name="gift-cost"
                    type="number"
                    value={newGift.cost}
                    onChange={(e) => setNewGift(prev => ({ ...prev, cost: parseInt(e.target.value) || 0 }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                    min="1"
                    max="10000"
                    step="1"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="gift-icon" className="block text-sm font-medium text-gray-700 mb-2">
                    {tr('圖示', 'Icon')}
                  </label>
                  <input
                    id="gift-icon"
                    name="gift-icon"
                    maxLength={10}
                    type="text"
                    value={newGift.icon}
                    onChange={(e) => setNewGift(prev => ({ ...prev, icon: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                    placeholder="🎁"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="gift-category" className="block text-sm font-medium text-gray-700 mb-2">
                  {tr('類別', 'Category')}
                </label>
                <select
                  id="gift-category"
                  name="gift-category"
                  value={newGift.category}
                  onChange={(e) => setNewGift(prev => ({ ...prev, category: e.target.value as CoinGift['category'] }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                  required
                >
                  <option value="service">{tr('服務', 'Service')}</option>
                  <option value="experience">{tr('體驗', 'Experience')}</option>
                  <option value="physical">{tr('實物', 'Physical')}</option>
                  <option value="intimate">{tr('親密', 'Intimate')}</option>
                </select>
              </div>

              <Button
                type="submit"
                loading={addingGift}
                loadingText={tr("添加中…", 'Adding…')}
                className="w-full py-3 text-base"
              >
                {editingGift ? tr('儲存修改', 'Save changes') : tr('添加禮品', 'Add gift')}
              </Button>
              <button
                type="button"
                onClick={closeModal}
                className="w-full py-2 text-sm font-body text-petal-muted hover:text-petal-ink"
              >
                {tr('稍後再說', 'Maybe later')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoinShopView;
