import { CSV_TEMPLATE } from "@/domain/csv";

export function GET() {
  return new Response(CSV_TEMPLATE + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="material-import-template.csv"',
    },
  });
}
