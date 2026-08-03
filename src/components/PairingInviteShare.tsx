import React, { useState } from 'react';

/**
 * Shown after a pairing invite is sent. Email is the slowest, least reliable
 * leg of the pairing flow — invites routinely land in 垃圾郵件 or Gmail's
 * 促銷 tab — so we hand the inviter the same accept link to pass along
 * directly. Follows the playbook's three-part gate shape: why it might not
 * have arrived, what you can do instead, and the CTA to do it.
 */
interface PairingInviteShareProps {
  /** Absolute accept URL, e.g. https://twogether.fun/pairing/accept?token=… */
  link: string;
  /** The address the invite was emailed to, shown for reassurance. */
  recipientEmail?: string;
  /** False when SMTP is unconfigured — then the link is the only channel. */
  emailSent?: boolean;
  /** Rendered non-interactively for the logged-out showroom. */
  sample?: boolean;
  className?: string;
}

const LINE_SHARE_PREFIX = 'https://line.me/R/msg/text/?';

export const PairingInviteShare: React.FC<PairingInviteShareProps> = ({
  link,
  recipientEmail,
  emailSent = true,
  sample = false,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const lineText = `我想和你一起用 Twogether，記錄我們的時光 💕\n${link}`;
  const lineUrl = `${LINE_SHARE_PREFIX}${encodeURIComponent(lineText)}`;

  const handleCopy = async () => {
    if (sample) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some in-app browsers; the link is visible
      // and selectable below, so there's still a way through.
      setCopied(false);
    }
  };

  return (
    <div className={`border border-petal-rule rounded-xl p-4 bg-petal-cream-2/50 ${className}`}>
      <p className="font-body text-sm text-petal-ink mb-1">
        {emailSent
          ? `邀請信已寄到 ${recipientEmail || '對方信箱'}。`
          : '邀請已建立，但目前無法寄信。'}
      </p>
      <p className="font-body text-xs text-petal-muted mb-3">
        信件可能會被分到垃圾郵件或促銷分頁。想更快一點，直接把下面的連結傳給 TA。
      </p>

      <div className="bg-white border border-petal-rule rounded-lg px-3 py-2 mb-3">
        <code className="font-mono text-xs text-petal-ink break-all select-all">{link}</code>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={handleCopy}
          disabled={sample}
          className="flex-1 py-2.5 rounded-md font-display italic text-sm bg-petal-ink text-petal-cream hover:bg-pink-700 transition-colors disabled:opacity-60"
        >
          {copied ? '✓ 已複製' : '複製連結'}
        </button>
        {sample ? (
          <span className="flex-1 py-2.5 rounded-md font-display italic text-sm text-center border border-petal-rule text-petal-muted">
            用 LINE 傳給 TA
          </span>
        ) : (
          <a
            href={lineUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 rounded-md font-display italic text-sm text-center border border-petal-rule text-petal-ink hover:bg-petal-cream-2 transition-colors"
          >
            用 LINE 傳給 TA
          </a>
        )}
      </div>
    </div>
  );
};

export default PairingInviteShare;
