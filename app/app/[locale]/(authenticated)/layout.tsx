import AppTopBar from "@/components/AppTopBar";
import RankingSearchList from "@/components/RankingSearchList";
import MyPredictionsTeamSearch from "@/components/MyPredictionsTeamSearch";
import { requireAuthenticatedUser } from "@/lib/auth-guard";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAuthenticatedUser();

  const isAdmin = profile.role === "admin";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <AppTopBar isAdmin={isAdmin} />
        {children}
        <RankingSearchList />
        <MyPredictionsTeamSearch />
      </div>
    </div>
  );
}
