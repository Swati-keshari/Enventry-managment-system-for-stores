export type ExportColumn = {
  key: string;
  header: string;
};

export type ExportRow = Record<string, string | number | boolean | null | undefined>;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function cellValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportToCsv(
  filename: string,
  columns: ExportColumn[],
  rows: ExportRow[],
) {
  const header = columns.map((c) => escapeCsv(c.header)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCsv(cellValue(row[c.key]))).join(","),
  );
  const csv = "\uFEFF" + [header, ...body].join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
}

export async function exportToXlsx(
  filename: string,
  sheetName: string,
  columns: ExportColumn[],
  rows: ExportRow[],
) {
  const XLSX = await import("xlsx");
  const data = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => cellValue(row[c.key]))),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export async function exportToPdf(
  filename: string,
  title: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  subtitle?: string,
) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(subtitle, 14, 22);
    doc.setTextColor(0);
  }

  autoTable(doc, {
    startY: subtitle ? 26 : 22,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => cellValue(row[c.key]))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: 10, right: 10 },
  });

  doc.save(`${filename}.pdf`);
}

export async function exportData(
  format: "csv" | "xlsx" | "pdf",
  options: {
    filename: string;
    title: string;
    sheetName?: string;
    subtitle?: string;
    columns: ExportColumn[];
    rows: ExportRow[];
  },
) {
  const { filename, title, sheetName = "Sheet1", subtitle, columns, rows } = options;
  if (rows.length === 0) {
    throw new Error("No data to export");
  }
  if (format === "csv") {
    exportToCsv(filename, columns, rows);
    return;
  }
  if (format === "xlsx") {
    await exportToXlsx(filename, sheetName, columns, rows);
    return;
  }
  await exportToPdf(filename, title, columns, rows, subtitle);
}
