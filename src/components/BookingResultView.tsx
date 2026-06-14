import React from 'react';
import { Video } from 'lucide-react';

// Landing screen ECPay returns the browser to after a video-session payment
// (path /booking/result). The session was already marked paid server-to-server;
// this screen just reports the outcome and returns to the app.
export const BookingResultView: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const params = new URLSearchParams(window.location.search);
  const success = params.get('status') !== 'failed';

  return (
    <div className="min-h-screen bg-petal-cream flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center bg-petal-cream rounded-md border border-petal-rule shadow-petal p-8">
        {success ? (
          <>
            <Video className="w-8 h-8 text-pink-600 mx-auto mb-3" strokeWidth={1.5} />
            <h2 className="font-display text-2xl font-light text-petal-ink mb-2">付款成功</h2>
            <p className="font-body text-sm text-petal-ink-soft mb-6">
              預約已確認。諮商師接受後會提供視訊會議連結，你可以在「我的預約」中查看。
            </p>
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl font-light text-petal-ink mb-2">付款未完成</h2>
            <p className="font-body text-sm text-petal-ink-soft mb-6">
              這次沒有完成付款。你可以回到「我的預約」再試一次。
            </p>
          </>
        )}
        <button
          onClick={onDone}
          data-testid="booking-result-done"
          className="w-full py-3 rounded-md bg-petal-ink text-petal-cream hover:bg-pink-700 transition-colors font-display italic text-base"
        >
          回到 Twogether
        </button>
      </div>
    </div>
  );
};

export default BookingResultView;
