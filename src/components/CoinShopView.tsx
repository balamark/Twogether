import { useState } from 'react';
import { Coins, Plus, X } from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';
import type { CoinGift } from '../App';

interface CoinShopViewProps {
  totalCoins: number;
  defaultGifts: CoinGift[];
  customGifts: CoinGift[];
  addCustomGift: (
    title: string,
    description: string,
    cost: number,
    category: CoinGift['category'],
    icon: string,
  ) => void;
  purchaseGift: (gift: CoinGift) => void;
}

// Coin Shop View Component. Defined at module scope (not inside App) so its
// identity is stable across App re-renders — a nested definition would remount
// on every render and wipe the in-progress "add custom gift" form. See issue #41.
const CoinShopView = ({
  totalCoins,
  defaultGifts,
  customGifts,
  addCustomGift,
  purchaseGift,
}: CoinShopViewProps) => {
  const [showAddGiftModal, setShowAddGiftModal] = useState(false);
  useScrollLock(showAddGiftModal);
  const [newGift, setNewGift] = useState({
    title: '',
    description: '',
    cost: 1000,
    category: 'service' as CoinGift['category'],
    icon: '🎁'
  });

  const allGifts = [...defaultGifts, ...customGifts];

  const handleAddGift = (e: React.FormEvent) => {
    e.preventDefault();
    addCustomGift(newGift.title, newGift.description, newGift.cost, newGift.category, newGift.icon);
    setNewGift({ title: '', description: '', cost: 1000, category: 'service', icon: '🎁' });
  };

  return (
    <div className="space-y-10">
      <div className="border-b border-petal-rule pb-7">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
              — 商店
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
              金幣<em className="not-italic font-light italic text-pink-600">商店</em>
            </h2>
            <p className="font-display italic font-light text-base text-petal-muted">
              用愛賺來的金幣，兌換特別禮品。
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="font-display italic font-light text-2xl text-petal-ink">
              <Coins className="inline w-4 h-4 mr-1.5 text-petal-rose-deep" strokeWidth={1.5} />
              <b className="not-italic font-medium">{totalCoins}</b> <span className="text-base text-petal-muted">枚</span>
            </div>
            <button
              onClick={() => setShowAddGiftModal(true)}
              className="px-4 py-1.5 border border-petal-rule rounded-full text-xs font-body text-petal-ink-soft hover:border-petal-ink hover:text-petal-ink transition-colors flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>自訂禮品</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {allGifts.map((gift) => (
          <div key={gift.id} className="bg-white rounded-md border border-petal-rule p-6 hover:border-petal-rose transition-colors">
            <div className="mb-4 pb-4 border-b border-petal-rule-soft">
              <div className="text-2xl mb-3 opacity-75 saturate-75">{gift.icon}</div>
              <h3 className="font-display text-lg font-medium tracking-tight text-petal-ink mb-1">{gift.title}</h3>
              <p className="font-body text-sm text-petal-ink-soft leading-relaxed">{gift.description}</p>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="font-body text-[11px] uppercase tracking-[0.12em] text-petal-muted">
                {gift.category === 'service' ? '服務' :
                 gift.category === 'experience' ? '體驗' :
                 gift.category === 'physical' ? '實物' : '親密'}
              </span>
              <div className="font-display italic font-light text-base text-petal-ink">
                <Coins className="inline w-3.5 h-3.5 mr-1 text-petal-rose-deep" strokeWidth={1.5} />
                <b className="not-italic font-normal">{gift.cost}</b>
              </div>
            </div>

            <button
              onClick={() => purchaseGift(gift)}
              disabled={totalCoins < gift.cost}
              className={`w-full py-2.5 rounded-md font-display italic text-base transition-colors ${
                totalCoins >= gift.cost
                  ? 'bg-petal-ink text-petal-cream hover:bg-pink-700'
                  : 'bg-petal-cream-2 text-petal-muted cursor-not-allowed'
              }`}
            >
              {totalCoins >= gift.cost ? '立即兌換 →' : '金幣不足'}
            </button>
          </div>
        ))}
      </div>

      {/* Add Custom Gift Modal */}
      {showAddGiftModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-yellow-700">添加自訂禮品</h3>
              <button
                onClick={() => setShowAddGiftModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddGift} className="space-y-4">
              <div>
                <label htmlFor="gift-title" className="block text-sm font-medium text-gray-700 mb-2">
                  禮品名稱
                </label>
                <input
                  id="gift-title"
                  name="gift-title"
                  type="text"
                  value={newGift.title}
                  onChange={(e) => setNewGift(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                  placeholder="例如：按摩服務"
                  required
                />
              </div>

              <div>
                <label htmlFor="gift-description" className="block text-sm font-medium text-gray-700 mb-2">
                  描述
                </label>
                <textarea
                  id="gift-description"
                  name="gift-description"
                  value={newGift.description}
                  onChange={(e) => setNewGift(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                  placeholder="詳細描述這個禮品"
                  rows={3}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="gift-cost" className="block text-sm font-medium text-gray-700 mb-2">
                    金幣價格
                  </label>
                  <input
                    id="gift-cost"
                    name="gift-cost"
                    type="number"
                    value={newGift.cost}
                    onChange={(e) => setNewGift(prev => ({ ...prev, cost: parseInt(e.target.value) }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                    min="100"
                    step="100"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="gift-icon" className="block text-sm font-medium text-gray-700 mb-2">
                    圖示
                  </label>
                  <input
                    id="gift-icon"
                    name="gift-icon"
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
                  類別
                </label>
                <select
                  id="gift-category"
                  name="gift-category"
                  value={newGift.category}
                  onChange={(e) => setNewGift(prev => ({ ...prev, category: e.target.value as CoinGift['category'] }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                  required
                >
                  <option value="service">服務</option>
                  <option value="experience">體驗</option>
                  <option value="physical">實物</option>
                  <option value="intimate">親密</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full bg-petal-ink text-petal-cream py-3 rounded-md font-display italic text-base hover:bg-pink-700 transition-colors"
              >
                添加禮品
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoinShopView;
