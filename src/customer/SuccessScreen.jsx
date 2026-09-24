// SuccessScreen · shown after the order is placed: queue position, pay at the
// counter, the LINE @siwara add-friend prompt, the review prompt, order again.
import { useState } from 'react';
import { Check, MessageCircle, RefreshCw, Star, Wallet } from 'lucide-react';
import Button from '../components/ui/Button';

const LINE_OA_URL = 'https://line.me/R/ti/p/@siwara';

// Hosts we'll hand off to the Google Maps app. reviewUrl is admin-set but the
// settings doc is writable by any anonymous client, so treat it as untrusted.
const MAPS_HOSTS = ['maps.app.goo.gl', 'g.page', 'goo.gl', 'maps.google.com', 'www.google.com', 'search.google.com'];

const card = 'w-full bg-[var(--bg-surface)] rounded-[var(--radius-lg)] shadow-[var(--elev-1)] px-5 py-5';

export default function SuccessScreen({ customerName, onReset, reviewUrl, queueNumber, redeemedRewardName, t }) {
  const hasReviewUrl = typeof reviewUrl === 'string' && reviewUrl.trim() !== '';
  const [reviewDone, setReviewDone] = useState(false);

  const handleReviewClick = () => {
    const url = reviewUrl.trim();
    // Many customers aren't signed into Google in their (in-app) browser, which
    // makes leaving a review painful. On Android, force the link into the Google
    // Maps app (where they're usually already signed in) and fall back to the
    // browser if Maps isn't installed. iOS/desktop open normally (a Maps
    // universal link still opens the app when it's installed).
    if (/Android/i.test(navigator.userAgent || '')) {
      try {
        const u = new URL(url);
        if (u.protocol === 'https:' && MAPS_HOSTS.includes(u.host)) {
          // Rebuild from parsed pieces (no hash / userinfo) so the untrusted URL
          // can't inject extra intent params, and confine it to Google Maps.
          const safeHostPath = u.host + u.pathname + u.search;
          window.location.href =
            `intent://${safeHostPath}#Intent;scheme=https;package=com.google.android.apps.maps;` +
            `S.browser_fallback_url=${encodeURIComponent(u.toString())};end`;
          setReviewDone(true);
          return;
        }
      } catch {
        // invalid URL · fall through to opening a normal tab
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    setReviewDone(true);
  };

  return (
    <div className="min-h-dvh bg-[var(--bg-canvas)] px-4 pt-10 pb-[max(2rem,env(safe-area-inset-bottom))] flex flex-col items-center">
      <div className="w-full max-w-md flex flex-col items-center gap-4 text-center">
        <div className="w-20 h-20 rounded-full bg-[var(--accent)] text-[var(--text-on-accent)] flex items-center justify-center shadow-[var(--elev-2)]" aria-hidden="true">
          <Check size={40} strokeWidth={3} />
        </div>

        <div role="status" className="space-y-1">
          <p className="text-[var(--text-secondary)] text-sm font-medium">{t('orderSent')}</p>
          <h1 className="text-[length:var(--fs-3xl)] leading-[var(--lh-3xl)] font-bold text-[var(--text-primary)] break-words">
            <span className="text-[var(--text-secondary)] text-[length:var(--fs-lg)] font-medium">{t('orderOf')} </span>{customerName}
          </h1>
        </div>

        {/* Big number = position in today's kitchen line (pending orders of this
            business day, ours included) · what the customer actually cares about.
            The order/ticket number (same one on the kitchen screen and receipt,
            restarts every day at 10:00) is shown small so staff can match it. */}
        <div className={`${card} space-y-2`}>
          {queueNumber?.pending > 1 ? (
            <>
              <p className="text-sm font-medium text-[var(--text-secondary)]">{t('kitchenPosition')}</p>
              {/* Thai tone marks sit above the line box · give them room */}
              <p className="text-5xl font-bold text-[var(--accent)] num leading-[1.3] pt-1">{t('positionN', queueNumber.pending)}</p>
              <p className="text-sm text-[var(--text-secondary)]">{t('ordersAhead', queueNumber.pending - 1)}</p>
            </>
          ) : (
            <p className="text-[var(--accent)] font-bold text-2xl leading-relaxed">{t('preparingDrink')}</p>
          )}
          {queueNumber?.number > 0 && (
            <p className="inline-flex items-center rounded-full bg-[var(--bg-sunken)] px-3 py-1 text-sm font-semibold text-[var(--text-secondary)] num">{t('orderNumber', queueNumber.number)}</p>
          )}
          <div className="flex items-center justify-center gap-2 pt-2 border-t border-[var(--border-color)] mt-2 text-[var(--text-primary)] font-semibold">
            <Wallet size={18} className="text-[var(--accent)]" aria-hidden="true" />
            {t('payAtCounter')}
          </div>
          <p className="text-sm text-[var(--text-muted)]">{t('staffWillCall')}</p>
        </div>

        {redeemedRewardName && (
          <div className="w-full rounded-[var(--radius-lg)] bg-[var(--accent-soft)] px-5 py-4 text-[var(--accent-soft-fg)]">
            <p className="text-sm font-semibold">{t('redeemedReward')}</p>
            <p className="text-xl font-bold">{redeemedRewardName}</p>
          </div>
        )}

        {/* LINE OA prompt · the shop's membership channel */}
        <div className={`${card} text-left`}>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-11 h-11 rounded-full bg-[#06C755] text-[#04200F] flex items-center justify-center" aria-hidden="true">
              <MessageCircle size={22} fill="currentColor" strokeWidth={1.5} />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-[var(--text-primary)]">{t('lineTitle')}</p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-0.5">{t('lineDesc')}</p>
            </div>
          </div>
          {/* LINE green with dark ink: white on #06C755 is only 2.2:1 */}
          <a
            href={LINE_OA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 w-full min-h-12 flex items-center justify-center gap-2 px-4 rounded-[var(--radius-sm)] font-bold text-base bg-[#06C755] text-[#04200F] active:scale-[0.98] transition-transform"
          >
            <MessageCircle size={18} aria-hidden="true" />
            {t('lineButton')}
          </a>
        </div>

        {hasReviewUrl && (
          <div className={card}>
            {reviewDone ? (
              <p className="font-bold text-[var(--accent)] text-base py-2">{t('reviewThanks')}</p>
            ) : (
              <>
                <p className="font-bold text-[var(--text-primary)]">{t('reviewPrompt')}</p>
                <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">{t('reviewDesc')}</p>
                <Button variant="secondary" size="lg" fullWidth leftIcon={<Star size={16} />} onClick={handleReviewClick}>
                  {t('writeReview')}
                </Button>
              </>
            )}
            {/* Review is verified in person: show the review, then staff applies 5% at payment */}
            <p className="text-[var(--accent-soft-fg)] text-sm font-semibold mt-3 leading-relaxed">{t('reviewDiscountNote')}</p>
          </div>
        )}

        <Button variant="outline" size="lg" fullWidth onClick={onReset} leftIcon={<RefreshCw size={18} />}>
          {t('orderAgain')}
        </Button>
      </div>
    </div>
  );
}
