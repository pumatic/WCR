import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const SUPER_ADMIN_EMAIL = "albert.fernandez@puma.com";

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}


export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect(`/${locale}/login`);
  }

  const userId = claimsData.claims.sub;

  const { data: me, error: meError } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (meError || !me || me.role !== "admin" || !me.is_active) {
    redirect(`/${locale}`);
  }

  const isSuperAdmin = normalizeEmail(me.email) === SUPER_ADMIN_EMAIL;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Backend
          </p>

          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900">
                Panel de administración
              </h1>
              <p className="mt-3 text-sm text-slate-600">
                Gestiona usuarios, accesos, partidos y resultados.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div className="font-semibold text-slate-900">
                {me.display_name || me.email || "Admin"}
              </div>
              <div className="mt-1">
                Sesión activa como <span className="font-medium">admin</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/${locale}/admin`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Resumen
            </Link>
            <Link
              href={`/${locale}/admin/users`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Usuarios
            </Link>
            <Link
              href={`/${locale}/admin/matches`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Partidos
            </Link>
            <Link
              href={`/${locale}/admin/kpis`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              KPIs
            </Link>
            <Link
              href={`/${locale}/admin/kpis/champion`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              KPIs 🏆
            </Link>
            <Link
              href={`/${locale}/admin/kpis/puma`}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              KPIs 🐈‍⬛
            </Link>
            {isSuperAdmin && (
              <Link
                href={`/${locale}/admin/super-predictions`}
                className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100"
              >
                Admin Preds. 🤖
              </Link>
            )}
            <Link
              href={`/${locale}`}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              ← Volver a la app
            </Link>
          </div>
        </section>

        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}