import type { ReportTable } from "@/lib/reports";
import { cn } from "@/components/ui/cn";

/** Renders any report. Number columns are right-aligned with tabular figures. */
export function ReportTableView({ table, compact }: { table: ReportTable; compact?: boolean }) {
  const numeric = new Set(table.numeric ?? []);
  if (!table.rows.length) return <p className="text-muted">No data yet.</p>;
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-white print:rounded-none">
      <table className={cn("w-full border-collapse text-left", compact ? "text-[14px]" : "text-[15px]")}>
        <thead className="border-b border-line bg-off">
          <tr>
            {table.columns.map((c, i) => (
              <th key={c} scope="col" className={cn("whitespace-nowrap px-3 py-2.5 font-semibold text-muted", numeric.has(i) && "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, ri) => (
            <tr key={ri} className="border-b border-line last:border-0">
              {r.map((v, ci) => (
                <td key={ci} className={cn("px-3 py-2.5 align-top", numeric.has(ci) && "text-right tabular-nums", ci === 1 && "min-w-48")}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
