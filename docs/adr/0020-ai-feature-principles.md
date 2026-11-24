# 0020. What each AI feature is for (prompt intent)

- Status: accepted (recorded 2026-11-24 from code comments)
- Covers: the prompts in `services/llm/claudeProvider.js` and their mock twins
- Related: [0019](0019-llm-provider-engineering.md), [0009](0009-sophie-conflict-mediator.md), [0016](0016-curated-content-catalogs.md)

Twogether is a therapy companion: a couple sees a therapist for about an hour a
week, and the rest of the work happens in the other 167 hours. Across all
prompts the AI is neutral, validates both partners, never decides who is right,
and organizes rather than diagnoses.

| Feature | Decision |
|---|---|
| **情緒翻譯** (the core move) | Look past the surface complaint to the layered emotion (anger on top; fear, loneliness or a need for reassurance underneath) and rewrite each message as the underlying **need**, in a gentle first-person I-message. **Batched:** one call translates the whole thread, so turning the lens on costs one quota unit and the model sees the whole cycle. |
| **Icebreaker** (整理成三種版本) | Neutral, firm and warm versions. The neutral one is a feelings-first opener in the user's own voice, never a narrator, and doesn't repeat the factual summary. |
| **Draft analysis** (即時情緒檢測) | Before a charged reply is sent, show the layered emotions, how the partner will probably *mishear* it versus the real worry, the need, and a rewrite that states the need. |
| **Wall / event counselor** | One gentle, even-handed comment visible to both partners. Name blaming, absolute or contemptuous language softly, and offer a kinder rephrase. |
| **Emotion acceptance** (接住情緒) | Coach the **receiver**: repair starts when a feeling is *received*, not solved. Responses validate, without explaining, debating or self-erasing apology. |
| **Reconciliation openers** | A face-saving "step down" that tests whether the partner will reopen the conversation; not an admission of fault. When an event is picked, anchor each opener to its concrete details. An earlier "stay away from the event" prompt produced canned 「在忙嗎？」 lines. Generic greetings are only for 不選對話. |
| **Appreciation questions** | Should read like a friend nudging you, never a worksheet. The curated bank ships on the client, and AI is the "想幾個新的" escape hatch. |
| **Marriage check-up** | Read both partners' independent ratings and produce an even-handed summary plus talking points. |
| **Therapy note** (治療摘要) | Written once, when an event resolves, and shared with both: the trigger, each side's real need, the negative cycle (pursue → withdraw → …), what repair worked, and one sentence to try next time. |
| **Therapy summary** (諮商摘要) | Organizes a period's events into something the couple brings *into* their next session, so the therapist doesn't spend 30 minutes gathering it. Not advice, not a diagnosis; it ends with three questions to raise. |
| **Therapy topics** (話題建議) | Looks forward. "No conflict" isn't "no relationship problem", so a quiet couple still gets 3–5 grounded topics. Never empty. |
| **Communication pattern** (溝通模式) | Zooms out across several resolved events: names the **one** recurring loop, gently flags rational-sounding wording that hides sarcasm, and offers one small practice. |
| **Therapist Mode facilitator** (引導模式) | A facilitator, not an advisor: each call is one turn. Pick one card, direct one partner to do one thing, wait, score, move on. Never a lecture. |
| **一起收尾 closure** | The AI comes in only after the humans have done the talking. 幫我想一個 is opt-in (users who know what to write spend no tokens), and it's grounded in the event's therapy note so suggestions aren't generic. The insight fires once, after resolution. A shared decision is optional. |
| **情緒深潛 Deep Dive** | Two parametrized generators (reflection and letter), not six near-identical ones. The non-negotiable guardrails (PRD §33, plus a safety exception) are appended to every step. Breaking a guardrail is worse than being shallow. |
| **真實故事 insights** | Three generalized repair takeaways. The same call is the post-moderation toxicity pre-check that feeds the admin queue. **Freeform structuring** splits the author's own words into the six sections without rewriting their voice or inventing content. |
| **Guest partner (阿哲)** | Believable, not ideal: he cares but gets a little defensive or explains first, which is exactly the moment the counselor helps with. Short, no insults, never mentions being an AI. |
