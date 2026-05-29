import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  ShieldCheck,
  TriangleAlert,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getImportQueue, type ImportStatus, importStatusLabel } from "@/lib/data";

const STATUS_VARIANT = {
  queued: "secondary",
  parsing: "default",
  encrypting: "warning",
  done: "success",
  review: "destructive",
} as const satisfies Record<ImportStatus, "secondary" | "default" | "warning" | "success" | "destructive">;

const STATUS_ICON = {
  queued: Loader2,
  parsing: Loader2,
  encrypting: Lock,
  done: CheckCircle2,
  review: TriangleAlert,
} as const satisfies Record<ImportStatus, typeof Loader2>;

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";

export default async function ImportPage() {
  const importQueue = await getImportQueue();
  const done = importQueue.filter((i) => i.status === "done").length;
  const inFlight = importQueue.filter((i) => i.status === "parsing" || i.status === "encrypting").length;
  const review = importQueue.filter((i) => i.status === "review").length;

  return (
    <AppShell active="candidates" title="Import résumés">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to candidates
        </Link>

        {/* Drop zone */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <UploadCloud className="size-6" />
              </div>
              <div>
                <p className="font-medium">Drag résumés here, or browse</p>
                <p className="text-sm text-muted-foreground">
                  PDF or DOCX, up to 10 MB each · bulk upload supported
                </p>
              </div>
              <Button size="sm">Browse files</Button>
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-success" />
              Scanned for malware, parsed in a sandboxed, egress-denied worker, then stored encrypted
              and audited.
            </p>
          </CardContent>
        </Card>

        {/* Queue summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Imported", value: done },
            { label: "In progress", value: inFlight },
            { label: "Needs review", value: review },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Queue */}
        <Card className="overflow-hidden p-0">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className={TH}>File</th>
                <th className={TH}>Size</th>
                <th className={TH}>Candidate</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {importQueue.map((item) => {
                const Icon = STATUS_ICON[item.status];
                const spinning = item.status === "parsing" || item.status === "queued";
                return (
                  <tr key={item.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FileText className="size-4 text-muted-foreground" />
                        <span className="font-medium">{item.filename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{item.sizeKb} KB</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.candidate ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[item.status]}>
                        <Icon className={spinning ? "size-3 animate-spin" : "size-3"} />
                        {importStatusLabel[item.status]}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          Résumés are treated as untrusted input — a new upload becomes a new immutable version,
          never an overwrite.
        </p>
      </div>
    </AppShell>
  );
}
