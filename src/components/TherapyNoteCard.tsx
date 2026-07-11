import React from 'react';
import { NotebookPen, Target, Heart, RefreshCw, Wrench, ArrowRight } from 'lucide-react';
import type { TherapyNote } from '../services/api';

// The post-conflict 治療摘要: a structured therapy note shown on a resolved
// event. Read-only; the same note is shared to both partners.
interface Props {
  note: TherapyNote;
}

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({
  icon,
  title,
  children,
}) => (
  <div>
    <div className="flex items-center gap-1.5 text-petal-sage-deep mb-1">
      {icon}
      <span className="font-body text-[11px] font-medium uppercase tracking-[0.12em]">{title}</span>
    </div>
    {children}
  </div>
);

const TherapyNoteCard: React.FC<Props> = ({ note }) => {
  const { trigger, needs, cycle, repairs, nextTime } = note;
  return (
    <div
      className="w-full text-left bg-petal-cream border border-petal-sage/40 rounded-2xl p-4 space-y-4"
      data-testid="event-therapy-note"
    >
      <div className="flex items-center gap-1.5 text-petal-sage-deep">
        <NotebookPen className="w-4 h-4" strokeWidth={1.5} />
        <span className="font-display italic text-base">治療摘要</span>
      </div>

      {trigger && (
        <Section icon={<Target className="w-3.5 h-3.5" strokeWidth={1.5} />} title="這次最大的觸發點">
          <p className="font-body text-sm text-petal-ink leading-relaxed">{trigger}</p>
        </Section>
      )}

      {needs && needs.length > 0 && (
        <Section icon={<Heart className="w-3.5 h-3.5" strokeWidth={1.5} />} title="真正的需求">
          <ul className="space-y-1">
            {needs.map((n, i) => (
              <li key={i} className="font-body text-sm text-petal-ink leading-relaxed">
                <span className="font-medium">{n.who}</span>
                <span className="text-petal-muted"> 需要 </span>
                <span className="inline-flex items-center rounded-full bg-petal-rose-deep/10 text-petal-rose-deep text-[12px] px-2 py-0.5">
                  {n.need}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {cycle && cycle.length > 0 && (
        <Section icon={<RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />} title="負向循環">
          <div className="flex flex-wrap items-center gap-1.5">
            {cycle.map((step, i) => (
              <React.Fragment key={i}>
                <span className="inline-flex items-center rounded-full border border-petal-rule bg-white text-petal-ink font-body text-[12px] px-2.5 py-1">
                  {step}
                </span>
                {i < cycle.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-petal-muted shrink-0" strokeWidth={1.5} />
                )}
              </React.Fragment>
            ))}
          </div>
        </Section>
      )}

      {repairs && repairs.length > 0 && (
        <Section icon={<Wrench className="w-3.5 h-3.5" strokeWidth={1.5} />} title="修復成功的地方">
          <ul className="space-y-1">
            {repairs.map((r, i) => (
              <li key={i} className="font-body text-sm text-petal-ink leading-relaxed">
                <span className="font-medium">{r.who}</span>
                <span className="text-petal-muted">：</span>
                {r.text}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {nextTime && (
        <div className="rounded-xl border border-petal-rose-deep/25 bg-petal-cream-2 px-3 py-2">
          <div className="flex items-center gap-1.5 text-petal-rose-deep mb-1">
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="font-body text-[11px] font-medium">下次可以先說</span>
          </div>
          <p className="font-body text-sm text-petal-ink leading-relaxed">「{nextTime}」</p>
        </div>
      )}
    </div>
  );
};

export default TherapyNoteCard;
