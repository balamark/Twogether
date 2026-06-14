import { Heart, Sparkles } from 'lucide-react';
import type { IntimateRecord, JourneyMilestone } from '../App';

interface OurJourneyViewProps {
  journeyMilestones: JourneyMilestone[];
  intimateRecords: IntimateRecord[];
  setCurrentView: React.Dispatch<React.SetStateAction<string>>;
}

// Our Journey View. Defined at module scope (not inside App) so its identity is
// stable across App re-renders. See issue #41.
const OurJourneyView = ({ journeyMilestones, intimateRecords, setCurrentView }: OurJourneyViewProps) => {
  const sortedMilestones = [...journeyMilestones]
    .filter(m => m.date || m.place)
    .sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return da - db;
    });

  const handleMilestoneClick = (milestone: JourneyMilestone) => {
    if (milestone.recordId) {
      // Find and highlight the specific record
      const record = intimateRecords.find(r => r.id === milestone.recordId);
      if (record) {
        setCurrentView('calendar');
        // Could add more specific navigation logic here
      }
    }
  };

  return (
    <div className="space-y-10">
      <div className="border-b border-petal-rule pb-7">
        <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
          — 旅程
        </div>
        <h2 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
          我們的<em className="not-italic font-light italic text-pink-600">愛情旅程</em>
        </h2>
        <p className="font-display italic font-light text-base text-petal-muted">
          記錄每個重要的時刻和里程碑。
        </p>
      </div>

      <div>
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-petal-rule"></div>

          <div className="space-y-8">
            {sortedMilestones.map((milestone) => (
              <div key={milestone.id} className="relative flex items-start space-x-6">
                {/* Timeline Node */}
                <div className="w-12 h-12 rounded-full bg-petal-cream border border-petal-rose-soft flex items-center justify-center relative z-10 text-base opacity-80 saturate-75">
                  {milestone.type === 'meeting' ? '💕' :
                   milestone.type === 'first_date' ? '🌹' :
                   milestone.type === 'first_kiss' ? '💋' :
                   milestone.type === 'first_sex' ? '💋' :
                   milestone.type === 'marriage' ? '👫' :
                   milestone.type === 'child_born' ? '👶' :
                   '✦'}
                </div>

                {/* Content */}
                <div className="flex-1 bg-white border border-petal-rule rounded-md p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-display text-lg font-medium tracking-tight text-petal-ink">{milestone.title}</h3>
                      <p className="font-display italic font-light text-sm text-petal-muted mt-0.5">
                        {milestone.date ? milestone.date.slice(0, 10) : (milestone.place ? '—' : '')}
                      </p>
                      {milestone.place && (
                        <p className="font-body text-xs text-petal-muted">地點：{milestone.place}</p>
                      )}
                    </div>
                    {milestone.count && (
                      <span className="font-display italic font-light text-xs text-petal-rose-deep border border-petal-rose-soft px-2.5 py-0.5 rounded-full">
                        第 {milestone.count} 次
                      </span>
                    )}
                  </div>
                  <p className="font-body text-sm text-petal-ink-soft leading-relaxed mb-3">{milestone.description}</p>

                  {milestone.recordId && (
                    <button
                      onClick={() => handleMilestoneClick(milestone)}
                      className="inline-flex items-center font-body text-xs text-petal-ink-soft hover:text-petal-rose-deep transition-colors"
                    >
                      <Heart className="w-3 h-3 mr-1" strokeWidth={1.5} />
                      查看詳細記錄 →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Future Milestones Preview */}
          <div className="mt-8 p-6 bg-petal-cream-2/40 rounded-md border border-dashed border-petal-rose-soft">
            <h3 className="font-display text-lg font-medium tracking-tight text-petal-ink mb-4 flex items-center">
              <Sparkles className="w-4 h-4 mr-2 text-petal-rose-deep" strokeWidth={1.5} />
              即將到來的里程碑
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { count: 10, achieved: intimateRecords.length >= 10 },
                { count: 20, achieved: intimateRecords.length >= 20 },
                { count: 50, achieved: intimateRecords.length >= 50 },
                { count: 100, achieved: intimateRecords.length >= 100 }
              ].map(({ count, achieved }) => (
                <div key={count} className={`p-4 rounded-lg border-2 ${
                  achieved
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 bg-white'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">第 {count} 次親密時光</span>
                    {achieved ? (
                      <span className="text-green-600 font-bold">✓ 已達成</span>
                    ) : (
                      <span className="text-gray-500">
                        還需 {count - intimateRecords.length} 次
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OurJourneyView;
