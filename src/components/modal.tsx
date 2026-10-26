"use client";

import { useEffect, useRef, type HTMLAttributes } from "react";

const stack: HTMLElement[] = [];
const inertOwners = new Map<HTMLElement, { count: number; original: boolean }>();

/** Keep nested sheets accessible without changing their presentation or portal location. */
export function Modal({ onDismiss, children, ...props }: HTMLAttributes<HTMLDivElement> & { onDismiss?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    const modal = ref.current;
    if (!modal) return;
    const previous = document.activeElement;
    const isolated: HTMLElement[] = [];
    for (let branch: HTMLElement = modal; branch.parentElement; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        const owner = inertOwners.get(sibling) ?? { count: 0, original: sibling.inert };
        owner.count++;
        inertOwners.set(sibling, owner);
        sibling.inert = true;
        isolated.push(sibling);
      }
      if (branch.parentElement === document.body) break;
    }
    stack.push(modal);
    const controls = () => [...modal.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]',
    )].filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[inert]') && node.getClientRects().length > 0);
    // Native showModal dialogs use the browser's top layer and own the focus above these sheets.
    const isTop = () => stack.at(-1) === modal && !document.querySelector('dialog:modal');
    const first = modal.querySelector<HTMLElement>('[data-modal-initial-focus]') ?? controls()[0] ?? modal;
    first.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === 'Escape' && dismiss.current) {
        event.preventDefault(); event.stopImmediatePropagation(); dismiss.current();
      } else if (event.key === 'Tab') {
        const list = controls();
        const index = list.indexOf(document.activeElement as HTMLElement);
        if (!list.length || (event.shiftKey ? index <= 0 : index === list.length - 1 || index === -1)) {
          event.preventDefault();
          (event.shiftKey ? list.at(-1) ?? modal : list[0] ?? modal).focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (isTop() && event.target instanceof Node && !modal.contains(event.target)) (controls()[0] ?? modal).focus();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
      stack.splice(stack.indexOf(modal), 1);
      for (const sibling of isolated) {
        const owner = inertOwners.get(sibling)!;
        if (--owner.count === 0) { sibling.inert = owner.original; inertOwners.delete(sibling); }
      }
      if (previous instanceof HTMLElement && previous.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
    };
  }, []);

  return <div {...props} ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>{children}</div>;
}
