"use client";

import { useMemo, useState } from "react";
import { generateRankingSnapshotAction } from "./actions";
import GenerateSnapshotButton from "./GenerateSnapshotButton";

type DailySnapshot = {
  key: string;
  label: string | null;
  createdAt: string;
};

type Props = {
  existingSnapshots: DailySnapshot[];
};

function getTodayValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function getSnapshotKey(date: string) {
  return date ? `day_${date.replaceAll("-", "_")}` : "";
}

function formatSnapshotLabel(date: string) {
  if (!date) return "";

  const [year, month, day] = date.split("-");
  return `${day}-${month}-${year}`;
}

export default function DailySnapshotForm({ existingSnapshots }: Props) {
  const [selectedDate, setSelectedDate] = useState(getTodayValue);
  const snapshotKey = getSnapshotKey(selectedDate);
  const snapshotLabel = formatSnapshotLabel(selectedDate);

  const existingSnapshot = useMemo(
    () => existingSnapshots.find((snapshot) => snapshot.key === snapshotKey) ?? null,
    [existingSnapshots, snapshotKey]
  );

  const latestSnapshot = existingSnapshots[0] ?? null;

  return (
    <div className="mt-6">
      {latestSnapshot && (
        <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span className="font-semibold">Ultimo snapshot diario:</span>{" "}
          {latestSnapshot.label || latestSnapshot.key}
        </div>
      )}

      <form action={generateRankingSnapshotAction}>
        <input type="hidden" name="snapshot_key" value={snapshotKey} />
        <input type="hidden" name="snapshot_label" value={snapshotLabel} />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="snapshot-date"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Fecha del snapshot
            </label>
            <input
              id="snapshot-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Etiqueta visible
            </p>
            <div className="min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {snapshotLabel || "Selecciona una fecha"}
            </div>
            {snapshotKey && (
              <p className="mt-1 text-xs text-slate-500">
                Clave: <code>{snapshotKey}</code>
              </p>
            )}
          </div>
        </div>

        {existingSnapshot && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Ya existe un snapshot para esta fecha. Al generarlo de nuevo se actualizara
            con la clasificacion actual.
          </div>
        )}

        <p className="mt-4 text-sm text-slate-500">
          Genera el snapshot despues de cerrar el ultimo partido del dia. La foto conserva
          la clasificacion acumulada hasta ese momento.
        </p>

        <div className="mt-4">
          <GenerateSnapshotButton
            label={existingSnapshot ? "Actualizar snapshot del dia" : "Generar snapshot del dia"}
          />
        </div>
      </form>
    </div>
  );
}