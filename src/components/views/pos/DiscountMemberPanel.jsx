import { memo, useState } from 'react';
import { ChevronDown, Coffee, Gift, Phone, RefreshCcw, Star, User, UserX, X } from 'lucide-react';
import { formatBaht } from '../../../utils/format';

function Toggle({ on, onClick, icon: Icon, title, hint }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick}
      className={`w-full min-h-14 flex items-center gap-3 px-3 rounded-[var(--radius-sm)] border text-left outline-none focus-visible:shadow-[var(--focus-ring)] ${on ? 'border-[var(--accent)] bg-[var(--bg-selected)]' : 'border-[var(--border-color)] bg-[var(--bg-surface)]'}`}>
      <Icon size={18} className="shrink-0 text-[var(--accent-soft-fg)]" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold leading-normal text-[var(--text-primary)]">{title}</span>
        <span className="block text-xs leading-[18px] text-[var(--text-muted)]">{hint}</span>
      </span>
      <span className={`w-11 h-6 shrink-0 rounded-full relative transition-colors ${on ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}`} aria-hidden="true">
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'right-0.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

/**
 * "ส่วนลด & สมาชิก": one collapsed row with chips for what is active; tap to
 * expand the own-cup / review toggles, member lookup and point redemption inline.
 * All state and handlers live in PosView (same logic as before). Memoised: the
 * handlers are stable, so ringing up items does not re-render it.
 */
function DiscountMemberPanel({
  bringOwnGlass, onToggleOwnGlass, ownGlassDiscount,
  reviewDiscount, onToggleReview, reviewDiscountAmount,
  memberPhone, onPhoneChange, memberNickname, onNicknameChange,
  nameFocused, onNameFocus, onNameBlur, nameSuggestions, onSelectMember,
  currentMember, onClearMember, onRefreshMembers, isRefreshingMembers,
  netTotal, redeemThreshold, redeemDiscountValue, usePoints, pointsRedeemActive, onToggleRedeem,
  eligibleRewards, redeemRewardId, onSelectReward,
}) {
  const [open, setOpen] = useState(false);
  const memberName = currentMember && !currentMember.isGuest
    ? (currentMember.isNew ? (memberNickname || 'ลูกค้าใหม่') : String(currentMember.name || ''))
    : (memberNickname || '');
  const chips = [
    bringOwnGlass && `แก้วตัวเอง −${formatBaht(ownGlassDiscount)}`,
    reviewDiscount && `รีวิว −${formatBaht(reviewDiscountAmount)}`,
    memberName && `${currentMember && !currentMember.isGuest ? 'สมาชิก' : 'ชื่อ'}: ${memberName}`,
    pointsRedeemActive && `ใช้แต้ม −${formatBaht(redeemDiscountValue)}`,
  ].filter(Boolean);

  return (
    <div className="border-t border-[var(--border-color)]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="w-full min-h-12 px-4 py-2 flex items-center gap-2 text-left outline-none focus-visible:shadow-[var(--focus-ring)] hover:bg-[var(--bg-hover)]">
        <span className="shrink-0 text-sm font-semibold text-[var(--text-primary)]">ส่วนลด & สมาชิก</span>
        <span className="flex-1 min-w-0 flex gap-1 overflow-hidden">
          {chips.length === 0
            ? <span className="text-sm text-[var(--text-muted)] truncate">ไม่มี</span>
            : chips.map((c) => (
              <span key={c} className="shrink-0 max-w-full truncate px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] text-xs font-medium">{c}</span>
            ))}
        </span>
        <ChevronDown size={18} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2 max-h-[45vh] overflow-y-auto">
          <Toggle on={bringOwnGlass} onClick={onToggleOwnGlass} icon={Coffee} title="นำแก้วมาเอง" hint={`ลดทันที ${formatBaht(ownGlassDiscount)}`} />
          <Toggle on={reviewDiscount} onClick={onToggleReview} icon={Star} title="รีวิวร้าน" hint="ลด 5% (ลูกค้ารีวิวแล้ว)" />

          <div className="rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-surface)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--text-primary)]">สะสมแต้ม</span>
              <span className="flex items-center gap-1">
                {(memberPhone || memberNickname || currentMember) && (
                  <button type="button" onClick={onClearMember} aria-label="ล้างสมาชิก" title="ล้างสมาชิกแล้วกรอกใหม่"
                    className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--state-danger)] hover:bg-[var(--bg-hover)]">
                    <X size={16} />
                  </button>
                )}
                <button type="button" onClick={onRefreshMembers} aria-label="รีเฟรชสมาชิก"
                  className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
                  <RefreshCcw size={15} className={isRefreshingMembers ? 'animate-spin' : ''} />
                </button>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 px-3 h-11 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] border border-[var(--border-strong)] focus-within:border-[var(--accent)]">
                <Phone size={14} className="shrink-0 text-[var(--text-muted)]" />
                <input type="tel" inputMode="numeric" maxLength={10} placeholder="เบอร์โทร" value={memberPhone} onChange={(e) => onPhoneChange(e.target.value)}
                  className="w-full min-w-0 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" />
              </label>
              <div className="relative">
                <label className="flex items-center gap-2 px-3 h-11 rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] border border-[var(--border-strong)] focus-within:border-[var(--accent)]">
                  <User size={14} className="shrink-0 text-[var(--text-muted)]" />
                  <input type="text" placeholder="ชื่อเล่น" value={memberNickname} autoComplete="off"
                    onFocus={onNameFocus} onBlur={onNameBlur} onChange={(e) => onNicknameChange(e.target.value)}
                    className="w-full min-w-0 bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" />
                </label>
                {nameFocused && nameSuggestions.length > 0 && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-raised)] shadow-[var(--elev-2)]">
                    {nameSuggestions.map((m) => (
                      <button key={m.id || m.phone} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onSelectMember(m)}
                        className="w-full min-h-11 px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] border-b last:border-b-0 border-[var(--border-light)]">
                        <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">{m.name || 'ลูกค้า'}</span>
                        <span className="block text-xs text-[var(--text-muted)] truncate">{m.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {currentMember?.isGuest && (
              <p className="flex items-start gap-2 text-xs leading-[18px] text-[var(--text-muted)]">
                <UserX size={14} className="shrink-0 mt-0.5" /> ไม่มีเบอร์ = ไม่บันทึกเป็นสมาชิก · ใส่เบอร์เพื่อสะสมแต้ม
              </p>
            )}

            {currentMember && !currentMember.isGuest && (
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">{memberName}</span>
                  {currentMember.isNew && <span className="shrink-0 px-1.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-fg)] text-xs font-medium">ใหม่</span>}
                </span>
                <span className="shrink-0 flex items-center gap-2 text-sm">
                  <span className="text-[var(--text-muted)]">{currentMember.isNew ? 'จะได้' : 'แต้ม'}</span>
                  <span className="num font-semibold text-[var(--accent-soft-fg)]">
                    {currentMember.isNew ? `+${Math.floor(netTotal / 10)}` : Number(currentMember.points || 0)}
                  </span>
                  {!currentMember.isNew && Number(currentMember.points || 0) >= redeemThreshold && (
                    <button type="button" onClick={onToggleRedeem} aria-pressed={usePoints}
                      className={`min-h-10 px-3 rounded-[var(--radius-sm)] text-xs font-semibold flex items-center gap-1 ${usePoints ? 'bg-[var(--state-warn)] text-[var(--text-on-warn)]' : 'bg-[var(--state-warn-soft)] text-[var(--state-warn)]'}`}>
                      <Gift size={14} />{usePoints ? 'ยกเลิก' : <>ใช้ <span className="num">{redeemThreshold}</span></>}
                    </button>
                  )}
                </span>
              </div>
            )}

            {eligibleRewards.length > 0 && (
              <div className="pt-2 border-t border-[var(--border-color)] space-y-1.5">
                <p className="text-xs font-semibold text-[var(--text-muted)]">แลกของรางวัล</p>
                {eligibleRewards.map((reward) => {
                  const on = redeemRewardId === reward.id;
                  return (
                    <button key={reward.id} type="button" aria-pressed={on} onClick={() => onSelectReward(reward.id)}
                      className={`w-full min-h-11 flex items-center justify-between px-3 rounded-[var(--radius-sm)] border text-left ${on ? 'bg-[var(--state-warn-soft)] border-[var(--state-warn)]' : 'bg-[var(--bg-surface)] border-[var(--border-color)]'}`}>
                      <span className={`text-sm font-medium ${on ? 'text-[var(--state-warn)]' : 'text-[var(--text-primary)]'}`}>{reward.name}</span>
                      <span className="text-xs font-semibold text-[var(--state-warn)]"><span className="num">{reward.cost}</span> แต้ม</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(DiscountMemberPanel);
