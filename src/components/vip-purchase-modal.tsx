"use client";

import { Modal } from "@/components/modal";
import { useId, useState } from "react";
import { useLanguage } from "@/components/language-provider";

type PlanId = "monthly" | "lifetime";

function SupportNotice({ text, email }: { text: string; email: string }) {
  const index = text.indexOf(email);
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <a href={`mailto:${email}`} className="underline underline-offset-2">
        {email}
      </a>
      {text.slice(index + email.length)}
    </>
  );
}

export function VipPurchaseModal({
  onClose,
  onCheckout,
  onTestToggle,
  testBusy = false,
  testNote = "",
}: {
  onClose: () => void;
  onCheckout?: (plan: PlanId) => void;
  onTestToggle?: () => void;
  testBusy?: boolean;
  testNote?: string;
}) {
  const titleId = useId();
  const [plan, setPlan] = useState<PlanId>("monthly");
  const [hasConsented, setHasConsented] = useState(false);
  const { t } = useLanguage();
  const copy = t.vipModal;

  const perks = [
    { icon: "👥", title: copy.privilege1Title, detail: copy.privilege1Desc },
    { icon: "🚫", title: copy.privilege2Title, detail: copy.privilege2Desc },
    { icon: "✨", title: copy.privilege3Title, detail: copy.privilege3Desc },
    { icon: "🚀", title: copy.privilege4Title, detail: copy.privilege4Desc },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md"
      role="presentation"
      onClick={onClose}
    >
      <Modal
        onDismiss={onClose}
        aria-labelledby={titleId}
        className="overscroll-contain max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-game-line bg-game-panel p-6 text-foreground "
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-2xl font-black text-foreground">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-foreground">{copy.subtitle}</p>

        <ul className="mt-5 flex flex-col gap-3">
          {perks.map((perk) => (
            <li key={perk.icon} className="flex gap-3 text-sm leading-6">
              <span aria-hidden="true" className="text-lg">
                {perk.icon}
              </span>
              <p>
                <span className="font-bold text-foreground">{perk.title}</span>
                <span className="text-foreground">: {perk.detail}</span>
              </p>
            </li>
          ))}
        </ul>

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold  text-foreground ">
            {copy.promoBadge}
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            <label
              className={`relative cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-amber-300 rounded-2xl border p-4 ${
                plan === "monthly"
                  ? "border-game-accent bg-game-selected "
                  : "border-game-line bg-white/5"
              }`}
            >
              <input
                type="radio"
                name="vip-plan"
                value="monthly"
                checked={plan === "monthly"}
                onChange={() => { setPlan("monthly"); setHasConsented(false); }}
                className="sr-only"
              />
              <span className="absolute top-3 right-3 rounded-full bg-game-accent px-2 py-0.5 text-[11px] font-black text-white">
                {copy.planABadge}
              </span>
              <p className="text-xs font-bold tracking-wide text-foreground">{copy.planATitle}</p>
              <p className="mt-1 text-lg font-black">{copy.planAPrice}</p>
              <p className="mt-1 text-sm text-foreground">{copy.planADesc}</p>
            </label>
            <label
              className={`cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-amber-300 rounded-2xl border p-4 ${
                plan === "lifetime"
                  ? "border-game-accent bg-game-selected "
                  : "border-game-line bg-white/5"
              }`}
            >
              <input
                type="radio"
                name="vip-plan"
                value="lifetime"
                checked={plan === "lifetime"}
                onChange={() => { setPlan("lifetime"); setHasConsented(false); }}
                className="sr-only"
              />
              <p className="text-xs font-bold tracking-wide text-foreground">{copy.planBTitle}</p>
              <p className="mt-1 text-lg font-black">{copy.planBPrice}</p>
              <p className="text-sm text-foreground">{copy.planBDesc}</p>
            </label>
          </div>
          <p className="mt-3 text-sm font-medium leading-6 text-foreground">{copy.deliveryNote}</p>
        </fieldset>

        <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs leading-5 text-foreground">
          <input
            type="checkbox"
            checked={hasConsented}
            onChange={(event) => setHasConsented(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-game-accent"
          />
          <span>{copy.purchaseConsent}</span>
        </label>

        <button
          type="button"
          onClick={() => onCheckout?.(plan)}
          disabled={!hasConsented}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-game-accent text-base font-black text-white  disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copy.payBtn}
        </button>
        <ul className="mt-4 flex flex-col gap-2 text-xs leading-5 text-game-muted">
          <li>{copy.payNoticeEcpay}</li>
          <li>{copy.payNoticeRefund}</li>
          <li>
            <SupportNotice text={copy.payNoticeSupport} email={copy.supportEmail} />
          </li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-11 w-full rounded-xl border border-game-line text-sm font-semibold text-foreground"
        >
          {copy.closeBtn}
        </button>
        <button
          type="button"
          disabled={testBusy}
          onClick={onTestToggle}
          className="mt-4 block w-full text-center text-xs text-game-muted underline decoration-zinc-600 underline-offset-4 disabled:opacity-50"
        >
          {testBusy ? copy.testBusy : copy.testToggle}
        </button>
        {testNote ? <p className="mt-2 text-center text-xs text-foreground">{testNote}</p> : null}
      </Modal>
    </div>
  );
}
