import { useEffect } from "react";
import { BellRing, X } from "lucide-react";
import { useAppStore } from "../state/store";

export function AppNotificationToast() {
  const notification = useAppStore((state) => state.notification);
  const dismissNotification = useAppStore((state) => state.dismissNotification);

  useEffect(() => {
    if (!notification) {
      return;
    }

    const timer = window.setTimeout(() => {
      dismissNotification();
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [dismissNotification, notification]);

  if (!notification) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="animate-toast-in pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-[22px] border border-amber-200 bg-white px-4 py-3 shadow-[0_20px_45px_rgba(15,23,42,0.12)]">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <BellRing className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Notice</div>
          <div className="mt-1 text-sm text-slate-700">{notification.message}</div>
        </div>
        <button
          type="button"
          onClick={dismissNotification}
          className="ui-action rounded-full border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
