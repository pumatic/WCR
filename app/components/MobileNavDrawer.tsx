"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

type MobileNavDrawerProps = {
  open: boolean;
  onClose: () => void;
  isAdmin?: boolean;
};

function getItemClass(active: boolean) {
  return [
    "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition",
    active
      ? "bg-slate-100 text-slate-900"
      : "text-slate-700 hover:bg-slate-50 hover:text-slate-900",
  ].join(" ");
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-slate-500">
      {children}
    </span>
  );
}

export default function MobileNavDrawer({
  open,
  onClose,
  isAdmin = false,
}: MobileNavDrawerProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("navigation");

  const homeHref = `/${locale}`;
  const rankingHref = `/${locale}/ranking`;
  const myPredictionsHref = `/${locale}/my-predictions`;
  const championHref = `/${locale}/champion`;
  const adminHref = `/${locale}/admin`;

  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = "";
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-[90] bg-black/35 transition-opacity duration-300 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed left-0 top-0 z-[100] flex h-full w-[82%] max-w-[340px] flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
        aria-label={t("mainMenu")}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
              World Cup Royale
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
              {t("menu")}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={t("closeMenu")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            <Link
              href={homeHref}
              onClick={onClose}
              className={getItemClass(pathname === homeHref)}
            >
              <NavIcon>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m3 9 9-7 9 7" />
                  <path d="M9 22V12h6v10" />
                </svg>
              </NavIcon>
              <span>{t("upcomingMatches")}</span>
            </Link>

            <Link
              href={rankingHref}
              onClick={onClose}
              className={getItemClass(pathname === rankingHref)}
            >
              <NavIcon>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20V10" />
                  <path d="M18 20V4" />
                  <path d="M6 20v-4" />
                </svg>
              </NavIcon>
              <span>{t("ranking")}</span>
            </Link>

            <Link
              href={myPredictionsHref}
              onClick={onClose}
              className={getItemClass(pathname === myPredictionsHref)}
            >
              <NavIcon>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </NavIcon>
              <span>{t("myPredictions")}</span>
            </Link>

            <Link
              href={championHref}
              onClick={onClose}
              className={getItemClass(pathname === championHref)}
            >
              <NavIcon>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 21h8" />
                  <path d="M12 17v4" />
                  <path d="M7 4h10" />
                  <path d="M17 4v2a5 5 0 0 1-10 0V4" />
                  <path d="M5 4h14" />
                  <path d="M6 4v1a6 6 0 0 0 12 0V4" />
                </svg>
              </NavIcon>
              <span>{t("champion")}</span>
            </Link>
          </div>

          {isAdmin ? (
            <>
              <div className="my-4 border-t border-slate-200" />

              <div className="space-y-1">
                <Link
                  href={adminHref}
                  onClick={onClose}
                  className={getItemClass(pathname === adminHref)}
                >
                  <NavIcon>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 3l8 4v6c0 5-3.5 8-8 8s-8-3-8-8V7l8-4z" />
                    </svg>
                  </NavIcon>
                  <span>{t("admin")}</span>
                </Link>
              </div>
            </>
          ) : null}
        </nav>
      </aside>
    </>
  );
}