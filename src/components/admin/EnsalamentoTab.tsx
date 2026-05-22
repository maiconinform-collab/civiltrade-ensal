/**
 * Aba de Gestão do Ensalamento.
 * 
 * Objetivo: Permite aos administradores criar, editar, excluir e reordenar as aulas.
 * Também inclui a funcionalidade de importar planilhas (Excel/CSV) para cadastro em lote.
 */

import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import { Plus, Pencil, Trash2, Loader2, Search, GripVertical, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { normalizeSearch, statusFor, getAndarNumero } from "@/lib/ensalamento-utils";

import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Ensalamento = {
  id: string; sala: string; bloco: string | null; turno: string; horario: string;
  professor: string | null; sort_order: number;
  segunda: string | null; terca: string | null; quarta: string | null;
  quinta: string | null; sexta: string | null; sabado: string | null;
};

type SalaOption = { id: string; nome: string; bloco: string | null };
type HorarioOption = { id: string; turno: string; hora_inicio: string; hora_fim: string };

const empty: Omit<Ensalamento, "id" | "sort_order"> = {
  sala: "", bloco: "", turno: "manha", horario: "", professor: "",
  segunda: "", terca: "", quarta: "", quinta: "", sexta: "", sabado: "",
};

const turnoLabels: Record<string, string> = {
  manha: "Manhã", tarde: "Tarde", noite: "Noite", integral: "Integral",
};

const DAY_FIELD_SEPARATOR = "|||";
const DAY_TIME_RANGE_REGEX = /\b(\d{1,2}[:hH]\d{0,2}\s*[-–àaté]+\s*\d{1,2}[:hH]\d{0,2})\b/i;
const DAY_TIME_SINGLE_REGEX = /\b(\d{1,2}[:hH]\d{2})\b/i;
const TURNO_MAP: Record<string, string> = {
  manha: "manha",
  manhã: "manha",
  tarde: "tarde",
  noite: "noite",
  integral: "integral",
};

const normalizeKey = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const normalizeHorario = (value: string) =>
  value
    .replace(/\s*(?:[-–àaté]+)\s*/gi, "-")
    .replace(/(\d{1,2})h(?!\d)/gi, "$1:00")
    .replace(/(\d{1,2})h(\d{2})/gi, "$1:$2")
    .replace(/\s+/g, "");

function SortableRow({ id, children, className }: { id: string, children: React.ReactNode, className?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
    position: isDragging ? "relative" as const : "static" as const,
  };
  return (
    <TableRow ref={setNodeRef} style={style} className={className}>
      <TableCell className="w-8 px-2 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </TableCell>
      {children}
    </TableRow>
  );
}

const EnsalamentoTab = ({ unidade }: { unidade: string }) => {
  // --- VARIÁVEIS CRÍTICAS E ESTADOS ---
  const [rows, setRows] = useState<Ensalamento[]>([]); // Linhas da tabela
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [andarFilter, setAndarFilter] = useState("todos");
  const [blocoFilter, setBlocoFilter] = useState("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ensalamento | null>(null);
  const [form, setForm] = useState(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>(new Date().getMonth().toString());

  const [salasOptions, setSalasOptions] = useState<SalaOption[]>([]);
  const [horariosOptions, setHorariosOptions] = useState<HorarioOption[]>([]);
  const [salaCustom, setSalaCustom] = useState(false);
  const [horarioCustom, setHorarioCustom] = useState(false);

  const [dayData, setDayData] = useState<Record<string, { materia: string; horario: string }>>({
    segunda: { materia: "", horario: "" },
    terca: { materia: "", horario: "" },
    quarta: { materia: "", horario: "" },
    quinta: { materia: "", horario: "" },
    sexta: { materia: "", horario: "" },
    sabado: { materia: "", horario: "" },
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // --- FUNÇÕES DE BUSCA E CARREGAMENTO ---
  // Busca as aulas no banco
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("ensalamento").select("*").eq("unidade", unidade).order("sort_order").order("turno").order("horario");
    if (error) toast.error("Erro ao carregar", { description: error.message });
    setRows((data as Ensalamento[]) ?? []);
    setLoading(false);
  };

  const loadOptions = async () => {
    const [salasRes, horariosRes] = await Promise.all([
      supabase.from("salas").select("id, nome, bloco").order("nome"),
      supabase.from("horarios").select("id, turno, hora_inicio, hora_fim").order("turno").order("hora_inicio"),
    ]);
    setSalasOptions((salasRes.data as SalaOption[]) ?? []);
    setHorariosOptions((horariosRes.data as HorarioOption[]) ?? []);
  };

  useEffect(() => { load(); loadOptions(); }, [unidade]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // --- LÓGICA DE IMPORTAÇÃO DE PLANILHA ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      // cellDates:false mantém datas como serials para conversão manual confiável
      const workbook = XLSX.read(data, { cellDates: false });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as any[];
      const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

      const toStr = (v: any) =>
        v !== undefined && v !== null && String(v).trim() !== ""
          ? String(v).trim()
          : null;

      const mappedFromHeader = json.map((row) => {
        const normalizedRow: any = {};
        for (const key of Object.keys(row)) {
          normalizedRow[normalizeKey(key)] = row[key];
        }

        let horarioStr = normalizedRow.horario ? normalizeHorario(String(normalizedRow.horario)) : "";
        if (!horarioStr) {
          const days = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
          for (const day of days) {
            const val = normalizedRow[day];
            if (!val) continue;
            const range = String(val).match(DAY_TIME_RANGE_REGEX);
            if (range?.[1]) {
              horarioStr = normalizeHorario(range[1]);
              break;
            }
          }
        }

        const turnoRaw = normalizeKey(String(normalizedRow.turno || normalizedRow.periodo || "manha"));
        const turno = TURNO_MAP[turnoRaw] ?? "manha";
        const sala = String(normalizedRow.sala || "").replace(/\D/g, "");

        return {
          sala,
          bloco: toStr(normalizedRow.bloco),
          turno,
          horario: horarioStr,
          professor: toStr(normalizedRow.professor),
          segunda: toStr(normalizedRow.segunda),
          terca: toStr(normalizedRow.terca),
          quarta: toStr(normalizedRow.quarta),
          quinta: toStr(normalizedRow.quinta),
          sexta: toStr(normalizedRow.sexta),
          sabado: toStr(normalizedRow.sabado),
          sort_order: 0,
          unidade,
        };
      }).filter((r) => r.sala);

      const mappedFromMatrix: any[] = [];
      let currentSala = "";
      let currentBloco: string | null = null;

      for (const row of matrix) {
        const cells = (row ?? []).map((c) => String(c ?? "").trim());
        if (cells.every((c) => !c)) continue;

        const first = cells[0] ?? "";
        if (first) {
          const firstNorm = normalizeKey(first);
          if (firstNorm.includes("sala")) {
            const salaMatch = first.match(/sala\s*([0-9]{2,4})/i) || first.match(/([0-9]{3,4})/);
            if (salaMatch?.[1]) currentSala = salaMatch[1];
            const blocoMatch = first.match(/bloco\s*([a-z0-9]+)/i);
            currentBloco = blocoMatch?.[1] ?? null;
          }
        }

        const turnoRaw = normalizeKey(cells[1] ?? "");
        const turno = TURNO_MAP[turnoRaw];
        const horario = normalizeHorario(cells[2] ?? "");
        if (!currentSala || !turno) continue;

        const dayValues = cells.slice(3, 9);
        const hasAnyDay = dayValues.some(Boolean);
        if (!horario && !hasAnyDay) continue;

        mappedFromMatrix.push({
          sala: currentSala,
          bloco: currentBloco,
          turno,
          horario,
          professor: null,
          segunda: dayValues[0] || null,
          terca: dayValues[1] || null,
          quarta: dayValues[2] || null,
          quinta: dayValues[3] || null,
          sexta: dayValues[4] || null,
          sabado: dayValues[5] || null,
          sort_order: 0,
          unidade,
        });
      }

      const mappedRows = (mappedFromHeader.length > 0 ? mappedFromHeader : mappedFromMatrix).filter(
        (r) => r.sala && r.sala !== "undefined"
      );

      if (mappedRows.length === 0) {
        toast.error(
          "Nenhuma aula encontrada.",
          { description: "Verifique se a planilha tem a coluna 'sala' preenchida." }
        );
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      let currentSortOrder = rows.length;
      for (const r of mappedRows) {
        r.sort_order = currentSortOrder++;
      }

      const { error } = await supabase.from("ensalamento").insert(mappedRows);
      if (error) throw error;

      toast.success(`${mappedRows.length} aula(s) importada(s) com sucesso!`);
      load();
    } catch (err: any) {
      toast.error("Erro ao importar", { description: err.message });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };


  // --- FUNÇÕES DO CRUD (Criar, Ler, Atualizar, Excluir) ---
  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setSalaCustom(false);
    setHorarioCustom(false);
    setDayData({
      segunda: { materia: "", horario: "" },
      terca: { materia: "", horario: "" },
      quarta: { materia: "", horario: "" },
      quinta: { materia: "", horario: "" },
      sexta: { materia: "", horario: "" },
      sabado: { materia: "", horario: "" },
    });
    setOpen(true);
  };

  // --- LÓGICA DE SEPARAÇÃO DIA/HORÁRIO (NOVO LAYOUT) ---
  const parseDay = (val: string | null) => {
    if (!val) return { materia: "", horario: "" };
    if (val.includes(DAY_FIELD_SEPARATOR)) {
      const [materiaRaw, horarioRaw] = val.split(DAY_FIELD_SEPARATOR, 2);
      return { materia: materiaRaw?.trim() ?? "", horario: horarioRaw?.trim() ?? "" };
    }
    const rangeMatch = val.match(DAY_TIME_RANGE_REGEX);
    if (rangeMatch) {
      const horario = rangeMatch[1].replace(/\s*(?:[-–àaté]+)\s*/i, "-").replace(/[hH]s?/g, ":00");
      const materia = val.replace(DAY_TIME_RANGE_REGEX, "").replace(/\s{2,}/g, " ").trim();
      return { materia, horario };
    }
    const singleMatch = val.match(DAY_TIME_SINGLE_REGEX);
    if (singleMatch) {
      const horario = singleMatch[1].replace(/[hH]/g, ":");
      const materia = val.replace(DAY_TIME_SINGLE_REGEX, "").replace(/\s{2,}/g, " ").trim();
      return { materia, horario };
    }
    return { materia: val, horario: "" };
  };

  const openEdit = (r: Ensalamento) => {
    setEditing(r);
    setForm({
      sala: r.sala, bloco: r.bloco ?? "", turno: r.turno, horario: r.horario,
      professor: r.professor ?? "",
      segunda: r.segunda ?? "", terca: r.terca ?? "", quarta: r.quarta ?? "",
      quinta: r.quinta ?? "", sexta: r.sexta ?? "", sabado: r.sabado ?? "",
    });
    setDayData({
      segunda: parseDay(r.segunda),
      terca: parseDay(r.terca),
      quarta: parseDay(r.quarta),
      quinta: parseDay(r.quinta),
      sexta: parseDay(r.sexta),
      sabado: parseDay(r.sabado),
    });
    const salaExists = salasOptions.some((s) => s.nome === r.sala);
    setSalaCustom(!salaExists);
    const horarioExists = horariosOptions.some((h) => `${h.hora_inicio}-${h.hora_fim}` === r.horario);
    setHorarioCustom(!horarioExists);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.sala || !form.horario || !form.turno) { toast.error("Preencha sala, turno e horário"); return; }

    const combineDay = (materia: string, horario: string) => {
      if (!materia && !horario) return null;
      if (materia && horario) return `${materia} ${horario}`;
      return materia || horario;
    };

    const payload = {
      ...form,
      bloco: form.bloco || null, professor: form.professor || null,
      segunda: combineDay(dayData.segunda.materia, dayData.segunda.horario),
      terca: combineDay(dayData.terca.materia, dayData.terca.horario),
      quarta: combineDay(dayData.quarta.materia, dayData.quarta.horario),
      quinta: combineDay(dayData.quinta.materia, dayData.quinta.horario),
      sexta: combineDay(dayData.sexta.materia, dayData.sexta.horario),
      sabado: combineDay(dayData.sabado.materia, dayData.sabado.horario),
      unidade,
    };
    const { error } = editing
      ? await supabase.from("ensalamento").update(payload).eq("id", editing.id)
      : await supabase.from("ensalamento").insert({ ...payload, sort_order: rows.length });
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success(editing ? "Atualizado" : "Criado");
    setOpen(false); load();
  };





  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("ensalamento").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir", { description: error.message }); return; }
    toast.success("Excluído"); setDeleteId(null); load();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = rows.findIndex((i) => i.id === active.id);
      const newIndex = rows.findIndex((i) => i.id === over.id);
      const newArray = arrayMove(rows, oldIndex, newIndex);
      setRows(newArray);

      const updates = newArray.map((item, index) => ({ id: item.id, sort_order: index }));
      try {
        await Promise.all(updates.map(u => supabase.from("ensalamento").update({ sort_order: u.sort_order }).eq("id", u.id)));
        toast.success("Ordem atualizada!");
      } catch (e) {
        toast.error("Erro ao salvar ordem");
      }
    }
  };

  const handleClearRecords = async () => {
    setLoading(true);
    const { error } = await supabase.from("ensalamento").delete().eq("unidade", unidade);
    if (error) { 
      toast.error("Erro ao limpar registros", { description: error.message }); 
    } else {
      toast.success("Todos os registros da unidade foram limpos!");
      setClearConfirmOpen(false);
      load();
    }
    setLoading(false);
  };

  // --- FILTROS E PESQUISA ---
  // Calcula andares e blocos únicos para preencher os selects de filtro
  const andaresUnicos = useMemo(() => Array.from(new Set(rows.map(r => getAndarNumero(r.sala)).filter(Boolean))).sort((a, b) => a! - b!), [rows]);
  const blocosUnicos = useMemo(() => Array.from(new Set(rows.map(r => r.bloco).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return rows.filter((r) => {
      if (andarFilter !== "todos" && getAndarNumero(r.sala)?.toString() !== andarFilter) return false;
      if (blocoFilter !== "todos" && r.bloco !== blocoFilter) return false;
      if (!q) return true;
      const fields = [
        r.sala, r.professor ?? "", r.bloco ?? "", r.horario, turnoLabels[r.turno] ?? r.turno,
        r.segunda ?? "", r.terca ?? "", r.quarta ?? "", r.quinta ?? "", r.sexta ?? "", r.sabado ?? "",
      ];
      return fields.some((f) => normalizeSearch(f).includes(q));
    });
  }, [rows, search, andarFilter, blocoFilter]);

  const handleSalaSelect = (value: string) => {
    if (value === "__custom__") {
      setSalaCustom(true);
      setForm({ ...form, sala: "", bloco: "" });
      return;
    }
    setSalaCustom(false);
    const sala = salasOptions.find((s) => s.nome === value);
    if (sala) setForm({ ...form, sala: sala.nome, bloco: sala.bloco ?? "" });
  };

  const handleHorarioSelect = (value: string) => {
    if (value === "__custom__") {
      setHorarioCustom(true);
      setForm({ ...form, horario: "" });
      return;
    }
    setHorarioCustom(false);
    setForm({ ...form, horario: value });
  };

  // Regex para aceitar apenas números na sala
  const handleSalaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || /^[0-9]+$/.test(val)) {
      setForm({ ...form, sala: val });
    }
  };

  // --- RENDERIZAÇÃO DA INTERFACE ---
  return (
    <div className="space-y-4 animate-fade-in">
      {/* --- CABEÇALHO E FILTROS --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Ensalamento</h2>
          <p className="text-muted-foreground text-sm">{rows.length} aula{rows.length === 1 ? "" : "s"} cadastrada{rows.length === 1 ? "" : "s"}</p>
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

          <Select value={andarFilter} onValueChange={setAndarFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Andar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos Andares</SelectItem>
              {andaresUnicos.map(a => <SelectItem key={a} value={a!.toString()}>{a}º Andar</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={blocoFilter} onValueChange={setBlocoFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Bloco" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos Blocos</SelectItem>
              {blocosUnicos.map(b => <SelectItem key={b} value={b as string}>Bloco {b}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar sala, prof, disciplina..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
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
            <Plus className="w-4 h-4 mr-2" /> Nova Aula
          </Button>
        </div>
      </div>

      {/* --- TABELA DE AULAS (COM DRAG & DROP) --- */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sala</TableHead>
                  <TableHead>Bloco</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Professor</TableHead>
                  <TableHead>Seg</TableHead>
                  <TableHead>Ter</TableHead>
                  <TableHead>Qua</TableHead>
                  <TableHead>Qui</TableHead>
                  <TableHead>Sex</TableHead>
                  <TableHead>Sáb</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={14} className="text-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin inline" />
                  </TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={14} className="text-center py-12 text-muted-foreground">
                    Nenhum registro
                  </TableCell></TableRow>
                ) : (
                  <SortableContext items={filtered.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    {filtered.map((r) => {
                      const st = statusFor(r.horario, now);
                      const isLive = st === "now";
                      return (
                        <SortableRow key={r.id} id={r.id} className={isLive ? "bg-primary/5" : ""}>
                          <TableCell>
                            {isLive ? (
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase text-destructive">
                                <span className="live-dot" /> Ao vivo
                              </span>
                            ) : st === "next" ? (
                              <span className="text-[10px] font-bold uppercase text-secondary">Próxima</span>
                            ) : st === "done" ? (
                              <span className="text-[10px] uppercase text-muted-foreground">Encerrada</span>
                            ) : (
                              <span className="text-[10px] uppercase text-muted-foreground">Agendada</span>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold">{r.sala}</TableCell>
                          <TableCell>{r.bloco ?? "—"}</TableCell>
                          <TableCell className="capitalize">{turnoLabels[r.turno] ?? r.turno}</TableCell>
                          <TableCell className="tabular-nums">{r.horario}</TableCell>
                          <TableCell>{r.professor ?? "—"}</TableCell>
                          <TableCell className="text-xs max-w-32 truncate">{r.segunda ?? "—"}</TableCell>
                          <TableCell className="text-xs max-w-32 truncate">{r.terca ?? "—"}</TableCell>
                          <TableCell className="text-xs max-w-32 truncate">{r.quarta ?? "—"}</TableCell>
                          <TableCell className="text-xs max-w-32 truncate">{r.quinta ?? "—"}</TableCell>
                          <TableCell className="text-xs max-w-32 truncate">{r.sexta ?? "—"}</TableCell>
                          <TableCell className="text-xs max-w-32 truncate">{r.sabado ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)} className="text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </SortableRow>
                      );
                    })}
                  </SortableContext>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>
      </div>

      {/* --- MODAL DE EDIÇÃO E CRIAÇÃO --- */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-strong">
          <DialogHeader><DialogTitle>{editing ? "Editar aula" : "Nova aula"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label>Sala * (Apenas números)</Label>
              {!salaCustom && salasOptions.length > 0 ? (
                <Select value={form.sala} onValueChange={handleSalaSelect}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma sala" /></SelectTrigger>
                  <SelectContent>
                    {salasOptions.map((s) => (
                      <SelectItem key={s.id} value={s.nome}>{s.nome}{s.bloco ? ` (Bloco ${s.bloco})` : ""}</SelectItem>
                    ))}
                    <SelectItem value="__custom__">✏️ Digitar manualmente...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input value={form.sala} onChange={handleSalaChange} placeholder="Ex: 701" className="flex-1" />
                  {salasOptions.length > 0 && <Button variant="outline" size="sm" onClick={() => setSalaCustom(false)}>Selecionar</Button>}
                </div>
              )}
            </div>

            <div className="space-y-2"><Label>Bloco</Label><Input value={form.bloco ?? ""} onChange={(e) => setForm({ ...form, bloco: e.target.value })} placeholder="Ex: A" /></div>

            <div className="space-y-2">
              <Label>Turno *</Label>
              <Select value={form.turno} onValueChange={(v) => setForm({ ...form, turno: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manha">Manhã</SelectItem>
                  <SelectItem value="tarde">Tarde</SelectItem>
                  <SelectItem value="noite">Noite</SelectItem>
                  <SelectItem value="integral">Integral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Horário *</Label>
              {!horarioCustom && horariosOptions.length > 0 ? (
                <Select value={form.horario} onValueChange={handleHorarioSelect}>
                  <SelectTrigger><SelectValue placeholder="Selecione um horário" /></SelectTrigger>
                  <SelectContent>
                    {horariosOptions.map((h) => {
                      const val = `${h.hora_inicio}-${h.hora_fim}`;
                      return <SelectItem key={h.id} value={val}>{val} ({turnoLabels[h.turno] ?? h.turno})</SelectItem>;
                    })}
                    <SelectItem value="__custom__">✏️ Digitar manualmente...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} placeholder="08:00-10:00" className="flex-1" />
                  {horariosOptions.length > 0 && <Button variant="outline" size="sm" onClick={() => setHorarioCustom(false)}>Selecionar</Button>}
                </div>
              )}
            </div>

            <div className="space-y-2 md:col-span-2"><Label>Professor</Label><Input value={form.professor ?? ""} onChange={(e) => setForm({ ...form, professor: e.target.value })} /></div>

            <div className="md:col-span-2 mt-4"><h3 className="font-semibold border-b border-border pb-2">Dias da Semana (Disciplina e Horário Específico)</h3></div>

            {(["segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const).map((d) => {
              return (
                <div key={d} className="space-y-2 md:col-span-2">
                  <Label className="capitalize">{d === "terca" ? "Terça" : d === "sabado" ? "Sábado" : d}</Label>
                  <div className="flex gap-2">
                    <Input
                      value={dayData[d]?.materia || ""}
                      onChange={(e) => setDayData({
                        ...dayData,
                        [d]: { ...dayData[d], materia: e.target.value }
                      })}
                      placeholder="Nome da Disciplina"
                      className="flex-[2]"
                    />
                    <Input
                      value={dayData[d]?.horario || ""}
                      onChange={(e) => setDayData({
                        ...dayData,
                        [d]: { ...dayData[d], horario: e.target.value }
                      })}
                      placeholder="Ex: 08:00-11:20"
                      className="flex-1"
                    />
                  </div>
                </div>
              );
            })}
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
            <AlertDialogTitle>Excluir esta aula?</AlertDialogTitle>
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
            <AlertDialogDescription>Esta ação apagará TODAS as aulas cadastradas da unidade <strong>{unidade}</strong>. Esta ação não pode ser desfeita.</AlertDialogDescription>
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

export default EnsalamentoTab;
