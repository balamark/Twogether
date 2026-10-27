import { useEffect, useState } from 'react';
import { tr } from '../i18n/tr';
import apiService from '../services/api';
import type { AlternativePlanSampleData } from '../services/api';

// 替代方案協商 — 示範方案. Admins manage the live list (/admin →「替代方案範例」,
// served by GET /intimacy-plans/samples); this copy mirrors migration 101's seed
// and renders first / whenever the fetch fails, so the empty plan list and the
// logged-out showroom always have something to show.
export type AlternativePlanSample = AlternativePlanSampleData;

export const ALTERNATIVE_PLAN_SAMPLES: AlternativePlanSample[] = [
  {
    id: 'sample-slow-night',
    title: tr('慢慢來的親密夜', 'A slow, close night'),
    interaction: tr(
      '先幫對方做一段精油按摩，從肩頸慢慢到全身，再依偎擁抱；只進行我們事先都說好、也都喜歡的親密方式。',
      'Start with an aromatherapy oil massage, from the shoulders slowly to the whole body, then cuddle. Only the kinds of intimacy we both agreed on and both enjoy.',
    ),
    timePrep: tr('約 1 小時。準備按摩精油和大毛巾，先洗澡、調暗燈光、手機開靜音。', 'About an hour. Get massage oil and a big towel ready, shower first, dim the lights, phones on silent.'),
    scriptId: null,
    scriptTitle: null,
  },
  {
    id: 'sample-first-meeting',
    title: tr('週末劇本之夜：初次相遇', 'Weekend script night: first meeting'),
    interaction: tr(
      '照劇本《初次相遇》演出：把客廳佈置成咖啡廳，從陌生人搭話的對白開始，跟著劇情慢慢熟悉彼此。',
      'Play the script "First meeting": turn the living room into a café, start with the strangers\' opening lines and let the plot bring you closer.',
    ),
    timePrep: tr('約 90 分鐘。準備兩個咖啡杯、背景音樂和各自的角色服裝。', 'About 90 minutes. Prepare two coffee cups, some background music and an outfit for each role.'),
    scriptId: 'first-meeting',
    scriptTitle: '初次相遇',
  },
];

/** Admin-managed samples, falling back to the built-in copy. Public, no auth. */
export function useAlternativePlanSamples(): AlternativePlanSample[] {
  const [samples, setSamples] = useState<AlternativePlanSample[]>(ALTERNATIVE_PLAN_SAMPLES);
  useEffect(() => {
    let cancelled = false;
    apiService.getAlternativePlanSamples()
      .then((rows) => {
        if (!cancelled && rows.length > 0) setSamples(rows);
      })
      .catch(() => { /* keep the built-in samples */ });
    return () => {
      cancelled = true;
    };
  }, []);
  return samples;
}
