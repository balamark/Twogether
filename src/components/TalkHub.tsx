import React from 'react';
import { MessageSquareHeart, HandHeart, Play, StickyNote, HeartHandshake } from 'lucide-react';
import EntryCard from './EntryCard';
import InfoHint from './InfoHint';

// 💬 對話 — the launcher for everything the couple might want to do about
// something that happened. It replaced a sticky sub-tab row that could only
// hold two destinations (說開一件事 / 接住情緒・檢查) and ate the top of every
// screen below it; as cards, the same two sit alongside 角色扮演, 我們的牆 and
// 專業諮商師 without any of them costing permanent vertical space.
//
// 說開一件事 is the product's core, so it keeps the weight: full width, filled
// icon, its own row. The other four are equal siblings in a 2-column grid.
// Getting back here from any of them is the 對話 tab itself, which stays
// highlighted throughout (see the nav-highlight map in App.tsx).

interface TalkHubProps {
  onGoToEvents: () => void;
  onGoToConflict: () => void;
  onGoToRoleplay: () => void;
  onGoToWall: () => void;
  onGoToTherapists: () => void;
}

const TalkHub: React.FC<TalkHubProps> = ({
  onGoToEvents,
  onGoToConflict,
  onGoToRoleplay,
  onGoToWall,
  onGoToTherapists,
}) => (
  <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4" data-testid="talk-hub">
    <header className="border-b border-petal-rule pb-6">
      <div className="font-body text-[11px] font-medium uppercase tracking-[0.18em] text-petal-muted mb-3">
        — 對話
      </div>
      <h1 className="font-display text-4xl md:text-5xl font-light tracking-tight text-petal-ink leading-[1.05] mb-3">
        我們要談<em className="not-italic font-light italic text-pink-600">什麼</em>
        <span className="align-middle ml-2"><InfoHint viewId="talk" /></span>
      </h1>
      <p className="font-display italic font-light text-base text-petal-muted">
        把話說開、接住情緒，或換個方式靠近彼此。
      </p>
    </header>

    <EntryCard
      icon={MessageSquareHeart}
      title="說開一件事"
      subtitle="寫下當下的情緒，AI 幫你說得對方聽得進去"
      onClick={onGoToEvents}
      testId="talk-events-entry"
      emphasis
    />

    <div className="grid grid-cols-2 gap-3">
      <EntryCard
        icon={HandHeart}
        title="情緒檢查"
        subtitle="接住對方的感受、做關係檢視"
        onClick={onGoToConflict}
        testId="talk-conflict-entry"
      />
      <EntryCard
        icon={Play}
        title="角色扮演"
        subtitle="換個方式靠近彼此"
        onClick={onGoToRoleplay}
        testId="talk-roleplay-entry"
      />
      <EntryCard
        icon={StickyNote}
        title="我們的牆"
        subtitle="留下悄悄話、稱讚 TA"
        onClick={onGoToWall}
        testId="talk-wall-entry"
      />
      <EntryCard
        icon={HeartHandshake}
        title="專業諮商師"
        subtitle="真人心理師，一對一預約"
        onClick={onGoToTherapists}
        testId="talk-therapists-entry"
      />
    </div>
  </div>
);

export default TalkHub;
