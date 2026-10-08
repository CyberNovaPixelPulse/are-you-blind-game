"use client";

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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border border-amber-300/40 bg-zinc-950 p-6 text-amber-50 shadow-[0_0_40px_rgba(251,191,36,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-2xl font-black text-amber-100">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-amber-100/80">{copy.subtitle}</p>

        <ul className="mt-5 flex flex-col gap-3">
          {perks.map((perk) => (
            <li key={perk.icon} className="flex gap-3 text-sm leading-6">
              <span aria-hidden="true" className="text-lg">
                {perk.icon}
              </span>
              <p>
                <span className="font-bold text-amber-100">{perk.title}</span>
                <span className="text-amber-50/75">: {perk.detail}</span>
              </p>
            </li>
          ))}
        </ul>

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold tracking-[0.16em] text-amber-200/80 uppercase">
            {copy.promoBadge}
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            <label
              className={`relative cursor-pointer rounded-2xl border p-4 ${
                plan === "monthly"
                  ? "border-amber-300 bg-amber-400/15 shadow-[0_0_18px_rgba(251,191,36,0.25)]"
                  : "border-white/15 bg-white/5"
              }`}
            >
              <input
                type="radio"
                name="vip-plan"
                value="monthly"
                checked={plan === "monthly"}
                onChange={() => setPlan("monthly")}
                className="sr-only"
              />
              <span className="absolute top-3 right-3 rounded-full bg-amber-300 px-2 py-0.5 text-[11px] font-black text-zinc-950">
                {copy.planABadge}
              </span>
              <p className="text-xs font-bold tracking-wide text-amber-200">{copy.planATitle}</p>
              <p className="mt-1 text-lg font-black">{copy.planAPrice}</p>
              <p className="mt-1 text-sm text-amber-50/75">{copy.planADesc}</p>
            </label>
            <label
              className={`cursor-pointer rounded-2xl border p-4 ${
                plan === "lifetime"
                  ? "border-amber-300 bg-amber-400/15 shadow-[0_0_18px_rgba(251,191,36,0.25)]"
                  : "border-white/15 bg-white/5"
              }`}
            >
              <input
                type="radio"
                name="vip-plan"
                value="lifetime"
                checked={plan === "lifetime"}
                onChange={() => setPlan("lifetime")}
                className="sr-only"
              />
              <p className="text-xs font-bold tracking-wide text-amber-200">{copy.planBTitle}</p>
              <p className="mt-1 text-lg font-black">{copy.planBPrice}</p>
              <p className="text-sm text-amber-50/75">{copy.planBDesc}</p>
            </label>
          </div>
          <p className="mt-3 text-sm font-medium leading-6 text-amber-100">{copy.deliveryNote}</p>
        </fieldset>

        <button
          type="button"
          onClick={() => onCheckout?.(plan)}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-amber-300 text-base font-black text-zinc-950 shadow-[0_0_24px_rgba(251,191,36,0.45)]"
        >
          {copy.payBtn}
        </button>
        <ul className="mt-4 flex flex-col gap-2 text-xs leading-5 text-neutral-400">
          <li>{copy.payNoticeEcpay}</li>
          <li>{copy.payNoticeRefund}</li>
          <li>
            <SupportNotice text={copy.payNoticeSupport} email={copy.supportEmail} />
          </li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-11 w-full rounded-full border border-white/15 text-sm font-semibold text-amber-50/90"
        >
          {copy.closeBtn}
        </button>
        <button
          type="button"
          disabled={testBusy}
          onClick={onTestToggle}
          className="mt-4 block w-full text-center text-xs text-zinc-500 underline decoration-zinc-600 underline-offset-4 disabled:opacity-50"
        >
          {testBusy ? copy.testBusy : copy.testToggle}
        </button>
        {testNote ? <p className="mt-2 text-center text-xs text-amber-300">{testNote}</p> : null}
      </div>
    </div>
  );
}
