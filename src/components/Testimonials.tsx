import React, { useEffect, useState } from 'react';
import { Star, Quote } from 'lucide-react';
import { apiService } from '../services/api';

export interface Testimonial {
  id: string;
  name: string;
  rating: number; // 1-5
  content: string;
}

// Placeholder social proof shown until real, admin-approved reviews exist.
const DEFAULT_TESTIMONIALS: Testimonial[] = [
  {
    id: 'default-1',
    name: '怡君 & 宥廷',
    rating: 5,
    content: '以前吵架都冷戰好幾天，現在用 AI 開場白先把話說開，和好快多了。記錄時光也讓我們更珍惜每次約會。',
  },
  {
    id: 'default-2',
    name: '小米',
    rating: 5,
    content: '衝突事件功能太實用了！把委屈寫下來、AI 幫我改成不那麼衝的語氣，對方比較聽得進去。',
  },
  {
    id: 'default-3',
    name: 'Ray',
    rating: 4,
    content: '角色扮演劇本很有創意，幫我們的生活增添不少新鮮感。介面也很溫暖好看。',
  },
];

const Stars: React.FC<{ rating: number }> = ({ rating }) => (
  <div className="flex items-center gap-0.5" aria-label={`${rating} 星`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star
        key={i}
        className={`w-3.5 h-3.5 ${i <= rating ? 'text-pink-500 fill-pink-500' : 'text-petal-rule'}`}
        strokeWidth={1.5}
      />
    ))}
  </div>
);

/**
 * "聽聽其他用戶怎麼說" — social-proof section on the logged-out page. Shows
 * admin-approved user reviews from the API, falling back to curated defaults
 * until any real reviews are approved.
 */
const Testimonials: React.FC = () => {
  const [items, setItems] = useState<Testimonial[]>(DEFAULT_TESTIMONIALS);

  useEffect(() => {
    let cancelled = false;
    apiService
      .getApprovedFeedback()
      .then((reviews) => {
        if (!cancelled && Array.isArray(reviews) && reviews.length > 0) {
          setItems(reviews);
        }
      })
      .catch(() => {
        // Keep defaults on any failure — this is decorative, never blocking.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="max-w-6xl mx-auto mt-20 pt-10 border-t border-petal-rule"
      data-testid="testimonials-section"
    >
      <div className="text-center mb-8">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 用戶心得
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-light tracking-tight text-petal-ink">
          聽聽其他用戶<em className="not-italic font-light italic text-pink-600">怎麼說</em>
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {items.map((t) => (
          <div
            key={t.id}
            className="bg-petal-cream border border-petal-rule rounded-md p-5 flex flex-col"
          >
            <Quote className="w-5 h-5 text-petal-rose-deep/60 mb-3" strokeWidth={1.5} />
            <p className="font-body text-sm text-petal-ink leading-relaxed flex-1">{t.content}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="font-display italic text-sm text-petal-ink">{t.name}</span>
              <Stars rating={t.rating} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Testimonials;
