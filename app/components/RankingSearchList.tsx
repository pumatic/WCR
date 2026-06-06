"use client";

import { Search, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type RankingSearchLabels = {
  searchLabel: string;
  searchPlaceholder: string;
  clearSearch: string;
  noSearchResults: string;
  resultCount: string;
  closeModal: string;
  loadingResults: string;
  userResultsTitle: string;
  userResultsSubtitle: string;
  noVisibleResults: string;
  predictionLabel: string;
  resultLabel: string;
  liveLabel: string;
  finishedLabel: string;
  pointsLabel: string;
  exactLabel: string;
  tendencyLabel: string;
  missLabel: string;
  pendingLabel: string;
  pumaMatchLabel: string;
  ambiguousUser: string;
  loadError: string;
};

type UserResult = {
  id: string;
  matchId: string;
  stage: string | null;
  matchDatetime: string | null;
  homeTeam: string;
  awayTeam: string;
  isPumaMatch: boolean;
  prediction: {
    home: number | null;
    away: number | null;
  };
  result: {
    home: number | null;
    away: number | null;
  };
  status: "finished" | "live";
  points: number | null;
  outcome: "exact" | "tendency" | "miss" | "pending";
};

type UserResultsResponse = {
  user: {
    id: string;
    displayName: string;
  };
  results: UserResult[];
};

const labelsByLocale: Record<string, RankingSearchLabels> = {
  en: {
    searchLabel: "Search user",
    searchPlaceholder: "Search user by name",
    clearSearch: "Clear search",
    noSearchResults: "No users match your search.",
    resultCount: "{count} users shown",
    closeModal: "Close",
    loadingResults: "Loading results...",
    userResultsTitle: "Latest visible results",
    userResultsSubtitle: "Only matches that have started or finished are shown.",
    noVisibleResults: "This user has no visible results yet.",
    predictionLabel: "Prediction",
    resultLabel: "Result",
    liveLabel: "Live / closed",
    finishedLabel: "Finished",
    pointsLabel: "pts",
    exactLabel: "Exact",
    tendencyLabel: "Trend",
    missLabel: "Miss",
    pendingLabel: "Pending",
    pumaMatchLabel: "PUMA Match",
    ambiguousUser: "Multiple users share this display name.",
    loadError: "Could not load this user's visible results.",
  },
  es: {
    searchLabel: "Buscar usuario",
    searchPlaceholder: "Buscar usuario por nombre",
    clearSearch: "Limpiar búsqueda",
    noSearchResults: "No hay usuarios que coincidan con tu búsqueda.",
    resultCount: "{count} usuarios visibles",
    closeModal: "Cerrar",
    loadingResults: "Cargando resultados...",
    userResultsTitle: "Últimos resultados visibles",
    userResultsSubtitle: "Solo se muestran partidos empezados o finalizados.",
    noVisibleResults: "Este usuario aún no tiene resultados visibles.",
    predictionLabel: "Predicción",
    resultLabel: "Resultado",
    liveLabel: "En juego / cerrado",
    finishedLabel: "Finalizado",
    pointsLabel: "pts",
    exactLabel: "Exacto",
    tendencyLabel: "Tendencia",
    missLabel: "Fallo",
    pendingLabel: "Pendiente",
    pumaMatchLabel: "PUMA Match",
    ambiguousUser: "Hay varios usuarios con este nombre visible.",
    loadError: "No se pudieron cargar los resultados visibles de este usuario.",
  },
  it: {
    searchLabel: "Cerca utente",
    searchPlaceholder: "Cerca utente per nome",
    clearSearch: "Cancella ricerca",
    noSearchResults: "Nessun utente corrisponde alla ricerca.",
    resultCount: "{count} utenti visualizzati",
    closeModal: "Chiudi",
    loadingResults: "Caricamento risultati...",
    userResultsTitle: "Ultimi risultati visibili",
    userResultsSubtitle: "Sono mostrate solo partite iniziate o concluse.",
    noVisibleResults: "Questo utente non ha ancora risultati visibili.",
    predictionLabel: "Pronostico",
    resultLabel: "Risultato",
    liveLabel: "Live / chiusa",
    finishedLabel: "Terminata",
    pointsLabel: "pts",
    exactLabel: "Esatto",
    tendencyLabel: "Tendenza",
    missLabel: "Errore",
    pendingLabel: "In sospeso",
    pumaMatchLabel: "PUMA Match",
    ambiguousUser: "Più utenti condividono questo nome visibile.",
    loadError: "Impossibile caricare i risultati visibili di questo utente.",
  },
  pt: {
    searchLabel: "Pesquisar utilizador",
    searchPlaceholder: "Pesquisar utilizador por nome",
    clearSearch: "Limpar pesquisa",
    noSearchResults: "Nenhum utilizador corresponde à pesquisa.",
    resultCount: "{count} utilizadores visíveis",
    closeModal: "Fechar",
    loadingResults: "A carregar resultados...",
    userResultsTitle: "Últimos resultados visíveis",
    userResultsSubtitle: "Só são mostrados jogos iniciados ou terminados.",
    noVisibleResults: "Este utilizador ainda não tem resultados visíveis.",
    predictionLabel: "Previsão",
    resultLabel: "Resultado",
    liveLabel: "Em jogo / fechado",
    finishedLabel: "Terminado",
    pointsLabel: "pts",
    exactLabel: "Exato",
    tendencyLabel: "Tendência",
    missLabel: "Falhou",
    pendingLabel: "Pendente",
    pumaMatchLabel: "PUMA Match",
    ambiguousUser: "Vários utilizadores têm este nome visível.",
    loadError: "Não foi possível carregar os resultados visíveis deste utilizador.",
  },
};

function normalizeSearchValue(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getLocaleFromPathname(pathname: string) {
  return pathname.split("/").filter(Boolean)[0] ?? "en";
}

function getFullRankingDetails() {
  const details = Array.from(document.querySelectorAll<HTMLDetailsElement>("main details"));
  return details[details.length - 1] ?? null;
}

function getRankingRows(details: HTMLDetailsElement) {
  const list = details.querySelector(".divide-y.divide-neutral-100");
  if (!list) return [];

  return Array.from(list.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement
  );
}

function formatScore(home: number | null, away: number | null) {
  if (home === null || away === null) return "-";
  return `${home} - ${away}`;
}

function getOutcomeLabel(outcome: UserResult["outcome"], labels: RankingSearchLabels) {
  switch (outcome) {
    case "exact":
      return labels.exactLabel;
    case "tendency":
      return labels.tendencyLabel;
    case "miss":
      return labels.missLabel;
    default:
      return labels.pendingLabel;
  }
}

function getOutcomeClass(outcome: UserResult["outcome"]) {
  switch (outcome) {
    case "exact":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "tendency":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "miss":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

export default function RankingSearchList() {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(0);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null);
  const [selectedResults, setSelectedResults] = useState<UserResult[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  const locale = getLocaleFromPathname(pathname);
  const labels = useMemo(() => labelsByLocale[locale] ?? labelsByLocale.en, [locale]);

  const openUserResults = useCallback(
    async (displayName: string) => {
      setSelectedUserName(displayName);
      setSelectedResults([]);
      setResultsError(null);
      setIsLoadingResults(true);

      try {
        const response = await fetch(
          `/${locale}/ranking/user-results?displayName=${encodeURIComponent(displayName)}`
        );

        if (!response.ok) {
          if (response.status === 409) {
            throw new Error(labels.ambiguousUser);
          }
          throw new Error(labels.loadError);
        }

        const payload = (await response.json()) as UserResultsResponse;
        setSelectedUserName(payload.user.displayName);
        setSelectedResults(payload.results);
      } catch (error) {
        setResultsError(error instanceof Error ? error.message : labels.loadError);
      } finally {
        setIsLoadingResults(false);
      }
    },
    [labels, locale]
  );

  const closeUserResults = useCallback(() => {
    setSelectedUserName(null);
    setSelectedResults([]);
    setResultsError(null);
    setIsLoadingResults(false);
  }, []);

  useEffect(() => {
    if (!pathname.includes("/ranking")) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const mount = () => {
      const details = getFullRankingDetails();
      const summary = details?.querySelector("summary");

      if (!details || !summary) {
        timeoutId = setTimeout(mount, 100);
        return;
      }

      if (cancelled) return;

      const existingHost = details.querySelector<HTMLElement>("[data-ranking-search-host]");
      if (existingHost) {
        setPortalHost(existingHost);
        return;
      }

      const host = document.createElement("div");
      host.dataset.rankingSearchHost = "true";
      details.insertBefore(host, summary.nextSibling);
      setPortalHost(host);
    };

    mount();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      const details = getFullRankingDetails();
      if (details) {
        getRankingRows(details).forEach((row) => {
          row.hidden = false;
        });
      }
      const host = document.querySelector<HTMLElement>("[data-ranking-search-host]");
      host?.remove();
      setPortalHost(null);
      setSearch("");
      setVisibleCount(0);
      closeUserResults();
    };
  }, [closeUserResults, pathname]);

  useEffect(() => {
    if (!portalHost) return;

    const details = portalHost.closest("details");
    if (!(details instanceof HTMLDetailsElement)) return;

    const rows = getRankingRows(details);

    rows.forEach((row) => {
      const nameElement = row.querySelector<HTMLElement>("p.truncate");
      if (!nameElement) return;

      nameElement.setAttribute("role", "button");
      nameElement.setAttribute("tabindex", "0");
      nameElement.classList.add(
        "cursor-pointer",
        "transition",
        "hover:text-violet-700",
        "hover:underline"
      );
    });

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const nameElement = target?.closest<HTMLElement>("p.truncate");
      if (!nameElement || !details.contains(nameElement)) return;

      const displayName = nameElement.textContent?.trim();
      if (!displayName) return;
      openUserResults(displayName);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;

      const target = event.target instanceof HTMLElement ? event.target : null;
      const nameElement = target?.closest<HTMLElement>("p.truncate");
      if (!nameElement || !details.contains(nameElement)) return;

      const displayName = nameElement.textContent?.trim();
      if (!displayName) return;

      event.preventDefault();
      openUserResults(displayName);
    };

    details.addEventListener("click", handleClick);
    details.addEventListener("keydown", handleKeyDown);

    return () => {
      details.removeEventListener("click", handleClick);
      details.removeEventListener("keydown", handleKeyDown);
    };
  }, [openUserResults, portalHost]);

  useEffect(() => {
    if (!portalHost) return;

    const details = portalHost.closest("details");
    if (!(details instanceof HTMLDetailsElement)) return;

    const normalizedSearch = normalizeSearchValue(search);
    const rows = getRankingRows(details);
    let nextVisibleCount = 0;

    rows.forEach((row) => {
      const name = row.querySelector("p.truncate")?.textContent ?? row.textContent ?? "";
      const isVisible = !normalizedSearch || normalizeSearchValue(name).includes(normalizedSearch);
      row.hidden = !isVisible;
      if (isVisible) nextVisibleCount += 1;
    });

    setVisibleCount(nextVisibleCount);
  }, [portalHost, search]);

  if (!portalHost) return null;

  const searchControl = createPortal(
    <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-4 sm:px-6">
      <label className="sr-only" htmlFor="ranking-user-search">
        {labels.searchLabel}
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
        />
        <input
          id="ranking-user-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          className="h-11 w-full rounded-2xl border border-neutral-200 bg-white pl-10 pr-11 text-sm font-medium text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label={labels.clearSearch}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="mt-2 text-xs font-medium text-neutral-500">
        {labels.resultCount.replace("{count}", String(visibleCount))}
      </p>
      {visibleCount === 0 && (
        <p className="mt-3 rounded-2xl bg-white px-4 py-4 text-sm text-neutral-600">
          {labels.noSearchResults}
        </p>
      )}
    </div>,
    portalHost
  );

  const modal = selectedUserName
    ? createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-3 py-4 sm:items-center sm:px-6">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10">
            <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-700">
                  {labels.userResultsTitle}
                </p>
                <h2 className="mt-1 truncate text-xl font-black text-neutral-900 sm:text-2xl">
                  {selectedUserName}
                </h2>
                <p className="mt-1 text-sm text-neutral-600">{labels.userResultsSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={closeUserResults}
                aria-label={labels.closeModal}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[68vh] overflow-y-auto px-5 py-4 sm:px-6">
              {isLoadingResults ? (
                <div className="py-10 text-center text-sm font-medium text-neutral-500">
                  {labels.loadingResults}
                </div>
              ) : resultsError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                  {resultsError}
                </div>
              ) : selectedResults.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-600">
                  {labels.noVisibleResults}
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedResults.map((result) => (
                    <article
                      key={result.id}
                      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {result.stage && (
                          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                            {result.stage}
                          </span>
                        )}
                        {result.isPumaMatch && (
                          <span className="inline-flex items-center rounded-full bg-gradient-to-r from-red-600 via-red-500 to-orange-500 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white shadow-sm">
                            {labels.pumaMatchLabel}
                          </span>
                        )}
                        <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                          {result.status === "finished" ? labels.finishedLabel : labels.liveLabel}
                        </span>
                      </div>

                      <h3 className="mt-3 text-base font-bold text-neutral-900">
                        {result.homeTeam} vs {result.awayTeam}
                      </h3>

                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-2xl bg-neutral-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                            {labels.predictionLabel}
                          </p>
                          <p className="mt-1 text-lg font-black text-neutral-900">
                            {formatScore(result.prediction.home, result.prediction.away)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-neutral-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                            {labels.resultLabel}
                          </p>
                          <p className="mt-1 text-lg font-black text-neutral-900">
                            {formatScore(result.result.home, result.result.away)}
                          </p>
                        </div>
                        <div className={`rounded-2xl border p-3 ${getOutcomeClass(result.outcome)}`}>
                          <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                            {result.points === null
                              ? labels.pendingLabel
                              : `${result.points} ${labels.pointsLabel}`}
                          </p>
                          <p className="mt-1 text-sm font-black">
                            {getOutcomeLabel(result.outcome, labels)}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {searchControl}
      {modal}
    </>
  );
}
