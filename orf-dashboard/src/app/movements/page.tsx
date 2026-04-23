import { fetchRecentMovements } from "@/lib/centralApi";
import { MovementsTable } from "@/components/movements-table";
import { RequireAuth } from "@/components/require-auth";
import { MovementsActions } from "@/components/movements-actions";

export const dynamic = "force-dynamic";

export default async function MovementsPage() {
  const movements = await fetchRecentMovements(200);

  return (
    <RequireAuth>
      <main className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Movimentações</h1>
          <MovementsActions /> {/* <--- AQUI */}
        </div>
        <MovementsTable movements={movements} />
      </main>
    </RequireAuth>
  );
}
