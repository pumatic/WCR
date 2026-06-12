import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import DailySnapshotForm from "./DailySnapshotForm";

type SearchParams = Promise<{
  success?: string;
  error?: string;
}>;

function getAlertFromQuery(success?: string, error?: string) {
  if (error) {
    switch (error) {
      case "snapshot-missing-key":
        return {
          type: "error" as const,
          message: "Debes indicar una clave de snapshot.",
        };
      case "snapshot-generate":
        return {
          type: "error" as const,
          message: "No se pudo generar el snapshot del ranking.",
        };
      default:
        return {
          type: "error" as const,
          message: "Ha ocurrido un error en la administración.",
        };
    }
  }

  if (success) {
    switch (success) {
      case "snapshot-generated":
        return {
          type: "success" as const,
          message: "Snapshot del ranking generado correctamente.",
        };
      default:
        return {
          type: "success" as const,
          message: "Operación completada correctamente.",
        };
    }
  }

  return null;
}

export default async function AdminHomePage({
  searchParams,
  params,
}: {
  searchParams: SearchParams;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  const alert = getAlertFromQuery(
    resolvedSearchParams.success,
    resolvedSearchParams.error
  );

  const supabase = await getSupabaseServerClient();

  const [{ data: users }, { data: matches }, { data: dailySnapshotRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, role, is_active, must_change_password"),
      supabase
        .from("matches")
        .select("id, status, is_puma_match"),
      supabase
        .from("ranking_snapshots")
        .select("snapshot_key, snapshot_label, created_at")
        .like("snapshot_key", "day_%")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  const safeUsers = users ?? [];
  const safeMatches = matches ?? [];

  const dailySnapshots = Array.from(
    new Map(
      (dailySnapshotRows ?? []).map((snapshot) => [
        snapshot.snapshot_key,
        {
          key: snapshot.snapshot_key,
          label: snapshot.snapshot_label,
          createdAt: snapshot.created_at,
        },
      ])
    ).values()
  ).slice(0, 10);

  const totalUsers = safeUsers.length;
  const admins = safeUsers.filter((u) => u.role === "admin").length;
  const activeUsers = safeUsers.filter((u) => u.is_active).length;
  const pendingPassword = safeUsers.filter((u) => u.must_change_password).length;

  const totalMatches = safeMatches.length;
  const upcoming = safeMatches.filter((m) => m.status === "upcoming").length;
  const live = safeMatches.filter((m) => m.status === "live").length;
  const finished = safeMatches.filter((m) => m.status === "finished").length;
  const pumaMatches = safeMatches.filter((m) => m.is_puma_match).length;

  function Card({
    title,
    value,
    href,
  }: {
    title: string;
    value: number;
    href?: string;
  }) {
    const content = (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </p>
        <p className="mt-2 text-3xl font-extrabold text-slate-900">{value}</p>
      </div>
    );

    return href ? <Link href={href}>{content}</Link> : content;
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-bold text-slate-900">Resumen</h2>
        <p className="mt-1 text-sm text-slate-500">
          Acceso rápido al estado general del backend.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card title="Usuarios" value={totalUsers} href={`/${locale}/admin/users`} />
          <Card title="Admins" value={admins} href={`/${locale}/admin/users`} />
          <Card title="Usuarios activos" value={activeUsers} href={`/${locale}/admin/users`} />
          <Card
            title="Cambio password pendiente"
            value={pendingPassword}
            href={`/${locale}/admin/users`}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Card title="Partidos" value={totalMatches} href={`/${locale}/admin/matches`} />
          <Card title="Upcoming" value={upcoming} href={`/${locale}/admin/matches?status=upcoming`} />
          <Card title="Live" value={live} href={`/${locale}/admin/matches?status=live`} />
          <Card title="Finished" value={finished} href={`/${locale}/admin/matches?status=finished`} />
          <Card title="Partidos PUMA" value={pumaMatches} href={`/${locale}/admin/matches`} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href={`/${locale}/admin/users`}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:bg-slate-50"
        >
          <h3 className="text-lg font-bold text-slate-900">Gestión de usuarios</h3>
          <p className="mt-2 text-sm text-slate-600">
            Accesos, roles, activación, reseteo de contraseña y estado de cuentas.
          </p>
        </Link>

        <Link
          href={`/${locale}/admin/matches`}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:bg-slate-50"
        >
          <h3 className="text-lg font-bold text-slate-900">Gestión de partidos</h3>
          <p className="mt-2 text-sm text-slate-600">
            Alta de partidos, actualización de resultados, estados y partidos PUMA.
          </p>
        </Link>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">Snapshots del ranking</h2>
        <p className="mt-1 text-sm text-slate-500">
          Genera una foto del ranking para conservar la clasificación en un momento concreto del torneo.
        </p>

        {alert && (
          <div
            className={`mt-6 rounded-2xl border p-4 text-sm ${
              alert.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {alert.message}
          </div>
        )}

        <DailySnapshotForm existingSnapshots={dailySnapshots} />
      </section>
    </div>
  );
}