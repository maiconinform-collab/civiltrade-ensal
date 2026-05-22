import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, Mic, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

type Evento = {
  id: string; nome: string; responsavel: string | null; descricao: string | null;
  inicio: string; fim: string; local: string | null;
};

const normalizeKey = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const MONTHS_PT: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, março: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

const parseTimeToParts = (value: string) => {
  const cleaned = value.trim().toLowerCase().replace(/\s+/g, "").replace("hs", "h");
  const hMatch = cleaned.match(/^(\d{1,2})h(?:(\d{2}))?$/);
  if (hMatch) return { h: Number(hMatch[1]), m: Number(hMatch[2] || "0") };
  const colonMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) return { h: Number(colonMatch[1]), m: Number(colonMatch[2]) };
  const hourOnly = cleaned.match(/^(\d{1,2})$/);
  if (hourOnly) return { h: Number(hourOnly[1]), m: 0 };
  return null;
};

const parseCellEvents = (cellValue: string) => {
  const sanitized = cellValue
    .replace(/\s+/g, " ")
    .replace(/([A-Za-zÀ-ÿ])(\d{1,2}(?::\d{2})?)/g, "$1 $2")
    .trim();
  if (!sanitized) return [];

  const timeRegex = /\d{1,2}(?::\d{2})?(?:\s*-\s*\d{1,2}(?::\d{2})?)?\s*(?:h|hs)?/gi;
  const matches = Array.from(sanitized.matchAll(timeRegex));
  if (matches.length === 0) return [];

  const events: { nome: string; inicio: string; fim: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const prev = matches[i - 1];
    const chunkStart = prev ? (prev.index ?? 0) + prev[0].length : 0;
    const chunkEnd = current.index ?? 0;
    const nome = sanitized.slice(chunkStart, chunkEnd).trim() || "Evento";

    const rawTime = current[0].replace(/\s+/g, "");
    const [startRaw, endRaw] = rawTime.split("-");
    const start = parseTimeToParts(startRaw.replace(/hs?$/i, ""));
    if (!start) continue;

    let end = endRaw ? parseTimeToParts(endRaw.replace(/hs?$/i, "")) : null;
    if (!end) {
      end = { h: start.h + 1, m: start.m };
    }

    const hh = String(start.h).padStart(2, "0");
    const mm = String(start.m).padStart(2, "0");
    const eh = String(end.h).padStart(2, "0");
    const em = String(end.m).padStart(2, "0");
    events.push({ nome, inicio: `${hh}:${mm}`, fim: `${eh}:${em}` });
  }

  return events;
};

const toLocalInput = (iso: string) => {
  // 'YYYY-MM-DDTHH:mm' for datetime-local input
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const empty = { nome: "", responsavel: "", descricao: "", inicio: "", fim: "", local: "Auditório Principal" };

const AuditorioTab = ({ unidade }: { unidade: string }) => {
  const [rows, setRows] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Evento | null>(null);
  const [form, setForm] = useState(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>(new Date().getMonth().toString());

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("auditorio_eventos").select("*").eq("unidade", unidade).order("inicio", { ascending: true });
    if (error) toast.error("Erro ao carregar", { description: error.message });
    setRows((data as Evento[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [unidade]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  /**
   * Converte datas do Excel para ISO string.
   * Suporta:
   *  - Número serial do Excel (ex: 46000.5)
   *  - String ISO (ex: "2026-05-10T09:00")
   *  - String brasileira (ex: "10/05/2026 09:00")
   * @param val valor da célula
   * @param fallback valor de retorno se falhar (default: agora)
   */
  const parseExcelDate = (val: any, fallback: Date = new Date()): Date => {
    if (val === undefined || val === null || val === "") return fallback;

    // Número serial do Excel: dias desde 1899-12-30
    if (typeof val === "number") {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const ms = val * 86400000;
      const d = new Date(excelEpoch.getTime() + ms);
      if (!isNaN(d.getTime())) return d;
    }

    if (typeof val === "string") {
      // Formato brasileiro: "DD/MM/AAAA HH:MM" ou "DD/MM/AAAA"
      const brMatch = val.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\sT](\d{1,2}):(\d{2}))?/
      );
      if (brMatch) {
        const [, dd, mm, yyyy, hh = "0", mi = "0"] = brMatch;
        const d = new Date(
          parseInt(yyyy), parseInt(mm) - 1, parseInt(dd),
          parseInt(hh), parseInt(mi)
        );
        if (!isNaN(d.getTime())) return d;
      }
      // Qualquer outro formato reconhecível pelo JS
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }

    return fallback;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      // cellDates:false mantém serials brutos para conversão confiável
      const workbook = XLSX.read(data, { cellDates: false });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as any[];
      const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

      const mappedFromHeader = json.map((row) => {
        const norm: any = {};
        for (const key of Object.keys(row)) {
          const k = key
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "_")
            .trim();
          norm[k] = row[key];
        }

        const nome = String(
          norm.nome || norm.evento || norm.title || norm.titulo || ""
        ).trim();

        const now = new Date();
        const inicioDate = parseExcelDate(
          norm.inicio || norm.data_inicio || norm.data || norm.start,
          now
        );
        const fimDate = parseExcelDate(
          norm.fim || norm.data_fim || norm.end,
          new Date(inicioDate.getTime() + 60 * 60 * 1000)
        );
        const fimFinal =
          fimDate > inicioDate
            ? fimDate
            : new Date(inicioDate.getTime() + 60 * 60 * 1000);

        return {
          nome: nome || "Evento Sem Nome",
          responsavel: norm.responsavel || norm.organizador || null,
          descricao: norm.descricao || norm.observacao || null,
          inicio: inicioDate.toISOString(),
          fim: fimFinal.toISOString(),
          local: norm.local || norm.sala || "Auditório Principal",
          unidade,
        };
      }).filter((r) => r.nome && r.nome !== "Evento Sem Nome");

      const mappedFromCalendar: any[] = [];
      const titleCell = String(matrix.find((r) => r?.some((c) => String(c ?? "").trim()))?.[0] ?? "");
      const titleNorm = normalizeKey(titleCell);
      const monthMatch = titleNorm.match(/([a-zçãéêíóôú]+)\s+(\d{4})/i);
      const month = monthMatch ? MONTHS_PT[monthMatch[1]] : undefined;
      const year = monthMatch ? Number(monthMatch[2]) : undefined;

      if (month !== undefined && year) {
        const weekdayRowIndex = matrix.findIndex((r) =>
          (r ?? []).some((c) => normalizeKey(String(c ?? "")).includes("segunda"))
        );

        if (weekdayRowIndex >= 0) {
          for (let rowIdx = weekdayRowIndex + 1; rowIdx < matrix.length - 1; rowIdx += 2) {
            const dayRow = matrix[rowIdx] ?? [];
            const eventsRow = matrix[rowIdx + 1] ?? [];

            for (let col = 0; col < 7; col++) {
              const dayRaw = String(dayRow[col] ?? "").trim();
              const day = Number(dayRaw);
              if (!Number.isInteger(day) || day <= 0 || day > 31) continue;

              const cellEvents = parseCellEvents(String(eventsRow[col] ?? ""));
              for (const event of cellEvents) {
                const startDate = new Date(year, month, day, Number(event.inicio.slice(0, 2)), Number(event.inicio.slice(3, 5)));
                const endDate = new Date(year, month, day, Number(event.fim.slice(0, 2)), Number(event.fim.slice(3, 5)));
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;

                mappedFromCalendar.push({
                  nome: event.nome,
                  responsavel: null,
                  descricao: null,
                  inicio: startDate.toISOString(),
                  fim: endDate.toISOString(),
                  local: "Auditório Principal",
                  unidade,
                });
              }
            }
          }
        }
      }

      const mappedRows = mappedFromHeader.length > 0 ? mappedFromHeader : mappedFromCalendar;

      if (mappedRows.length === 0) {
        toast.error("Nenhum evento encontrado. Verifique as colunas ou o formato da planilha.");
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const { error } = await supabase.from("auditorio_eventos").insert(mappedRows);
      if (error) throw error;

      toast.success(`${mappedRows.length} evento(s) importado(s) com sucesso!`);
      load();
    } catch (err: any) {
      toast.error("Erro ao importar", { description: err.message });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (r: Evento) => {
    setEditing(r);
    setForm({
      nome: r.nome, responsavel: r.responsavel ?? "", descricao: r.descricao ?? "",
      inicio: toLocalInput(r.inicio), fim: toLocalInput(r.fim), local: r.local ?? "Auditório Principal",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome || !form.inicio || !form.fim) { toast.error("Preencha nome, início e fim"); return; }
    if (new Date(form.fim) <= new Date(form.inicio)) { toast.error("Fim deve ser depois do início"); return; }
    const payload = {
      nome: form.nome, responsavel: form.responsavel || null, descricao: form.descricao || null,
      inicio: new Date(form.inicio).toISOString(), fim: new Date(form.fim).toISOString(),
      local: form.local || null,
      unidade,
    };
    const { error } = editing
      ? await supabase.from("auditorio_eventos").update(payload).eq("id", editing.id)
      : await supabase.from("auditorio_eventos").insert(payload);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success(editing ? "Atualizado" : "Criado");
    setOpen(false); load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("auditorio_eventos").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir", { description: error.message }); return; }
    toast.success("Excluído"); setDeleteId(null); load();
  };

  const handleClearRecords = async () => {
    setLoading(true);
    const { error } = await supabase.from("auditorio_eventos").delete().eq("unidade", unidade);
    if (error) { 
      toast.error("Erro ao limpar registros", { description: error.message }); 
    } else {
      toast.success("Todos os registros foram limpos com sucesso!");
      setClearConfirmOpen(false);
      load();
    }
    setLoading(false);
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const filteredRows = rows.filter(r => {
    if (monthFilter === "todos") return true;
    return new Date(r.inicio).getMonth().toString() === monthFilter;
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Mic className="w-6 h-6 text-primary" /> Agenda do Auditório</h2>
          <p className="text-muted-foreground text-sm">{filteredRows.length} evento{filteredRows.length === 1 ? "" : "s"} listado{filteredRows.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Meses</SelectItem>
              <SelectItem value="0">Janeiro</SelectItem>
              <SelectItem value="1">Fevereiro</SelectItem>
              <SelectItem value="2">Março</SelectItem>
              <SelectItem value="3">Abril</SelectItem>
              <SelectItem value="4">Maio</SelectItem>
              <SelectItem value="5">Junho</SelectItem>
              <SelectItem value="6">Julho</SelectItem>
              <SelectItem value="7">Agosto</SelectItem>
              <SelectItem value="8">Setembro</SelectItem>
              <SelectItem value="9">Outubro</SelectItem>
              <SelectItem value="10">Novembro</SelectItem>
              <SelectItem value="11">Dezembro</SelectItem>
            </SelectContent>
          </Select>
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            disabled={importing}
          >
            {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {importing ? "Importando..." : "Importar Planilha"}
          </Button>
          <Button variant="destructive" onClick={() => setClearConfirmOpen(true)}>
            <Trash2 className="w-4 h-4 mr-2" /> Limpar Registros
          </Button>
          <Button onClick={openNew} className="gradient-brand border-0 shadow-brand">
            <Plus className="w-4 h-4 mr-2" /> Novo evento
          </Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin inline" /></TableCell></TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Nenhum evento</TableCell></TableRow>
            ) : filteredRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-semibold">{r.nome}</TableCell>
                <TableCell>{r.responsavel ?? "—"}</TableCell>
                <TableCell>{r.local ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{fmt(r.inicio)}</TableCell>
                <TableCell className="tabular-nums">{fmt(r.fim)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl glass-strong">
          <DialogHeader><DialogTitle>{editing ? "Editar evento" : "Novo evento do auditório"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-2 md:col-span-2"><Label>Nome do evento *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-2"><Label>Responsável</Label><Input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} /></div>
            <div className="space-y-2"><Label>Local</Label><Input value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} /></div>
            <div className="space-y-2"><Label>Início *</Label><Input type="datetime-local" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} /></div>
            <div className="space-y-2"><Label>Fim *</Label><Input type="datetime-local" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Descrição</Label><Textarea rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gradient-brand border-0">{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este evento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todos os registros?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação apagará TODOS os eventos do auditório da unidade <strong>{unidade}</strong>. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearRecords} className="bg-destructive hover:bg-destructive/90">Sim, limpar tudo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AuditorioTab;
