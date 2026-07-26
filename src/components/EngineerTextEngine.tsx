import { useEffect } from 'react';
import { useEngineerMode } from '../contexts/EngineerModeContext';
import { ENGINEER_LEXICON } from '../content/engineerLexicon';

// EngineerTextEngine — 工程師模式的「文字翻譯引擎」。
//
// 因為專案沒有 i18n（所有中文都硬編碼在各元件的 JSX 裡），要在不改動
// 80 個元件的前提下把整站文案換成工程師黑話，最務實的做法是：在
// 模式生效時，掃描已渲染的 DOM，對「整個文字節點去頭尾空白後與詞典
// key 完全相符」的節點做即時替換，並用 MutationObserver 追蹤之後
// 新渲染的內容。要擴充覆蓋率＝在 engineerLexicon.ts 加一組對照，
// 不用再碰元件。
//
// 安全性考量：
//  - 只做「完全相符」替換，key 都是完整 UI 片語，幾乎不會誤傷使用者
//    自己輸入的內容。
//  - 跳過 SCRIPT / STYLE / TEXTAREA / 可編輯區，以及任何被標記
//    data-no-eng 的子樹（例如使用者暱稱、貼文內容等應保留原樣處）。
//  - 關閉模式時，把碰過的節點還原回原本中文。
//  - 我們自己寫回去的英文不會是任何 key，所以 observer 觸發的再處理
//    會查無、直接略過，不會無限迴圈。

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'CODE', 'PRE']);

function shouldSkip(el: Element | null): boolean {
  let node: Element | null = el;
  while (node) {
    if (SKIP_TAGS.has(node.tagName)) return true;
    if ((node as HTMLElement).isContentEditable) return true;
    if (node.hasAttribute('data-no-eng')) return true;
    node = node.parentElement;
  }
  return false;
}

export default function EngineerTextEngine() {
  const { enabled } = useEngineerMode();

  useEffect(() => {
    if (!enabled) return;

    // 記住我們改過的每個文字節點的原始值，關閉時還原。
    const original = new Map<Text, string>();

    const translateNode = (node: Text) => {
      const raw = node.nodeValue ?? '';
      const key = raw.trim();
      if (!key) return;
      const replacement = ENGINEER_LEXICON[key];
      if (!replacement || replacement === key) return;
      if (shouldSkip(node.parentElement)) return;
      if (!original.has(node)) original.set(node, raw);
      const next = raw.replace(key, replacement);
      if (node.nodeValue !== next) node.nodeValue = next;
    };

    const walk = (root: Node) => {
      // 只看文字節點。
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const batch: Text[] = [];
      let current = walker.nextNode();
      while (current) {
        batch.push(current as Text);
        current = walker.nextNode();
      }
      batch.forEach(translateNode);
    };

    // 初次全掃。
    walk(document.body);

    // 追蹤之後渲染 / 變更的內容。
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'characterData' && m.target.nodeType === Node.TEXT_NODE) {
          translateNode(m.target as Text);
        } else if (m.type === 'childList') {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === Node.TEXT_NODE) translateNode(n as Text);
            else if (n.nodeType === Node.ELEMENT_NODE) walk(n);
          });
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      // 還原中文。
      original.forEach((value, node) => {
        if (node.isConnected) node.nodeValue = value;
      });
      original.clear();
    };
  }, [enabled]);

  return null;
}
