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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Pencil, Trash2, Loader2, Search, GripVertical, Upload, ArrowRightLeft, Download, CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { normalizeSearch, statusFor, getAndarNumero, dayKey, getCurrentTurno, exportToCSV } from "@/lib/ensalamento-utils";

import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, useDroppable, useDraggable
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Ensalamento = {
  id: string; sala: string; bloco: string | null; turno: string; horario: string;
  professor: string | null; sort_order: number; data: string | null;
  disciplina: string | null;
  // Colunas legadas (mantidas para retrocompatibilidade com dados importados)
  segunda: string | null; terca: string | null; quarta: string | null;
  quinta: string | null; sexta: string | null; sabado: string | null;
};

type SalaOption = { id: string; nome: string; bloco: string | null; status?: string };
type HorarioOption = { id: string; turno: string; hora_inicio: string; hora_fim: string };

// Modelo atômico: 1 linha = 1 aula em 1 data específica
const empty = {
  sala: "", bloco: "", turno: "manha", horario: "", professor: "",
  data: "", disciplina: "",
} as const;

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

function DroppableRoomBlock({ 
  room, 
  nextUse, 
  onStatusChange 
}: { 
  room: SalaOption; 
  nextUse?: string; 
  onStatusChange?: (id: string, name: string, status: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `room-${room.nome}`,
  });

  const getStatusColors = (status: string) => {
    switch (status) {
      case "Livre": return "border-green-500/30 bg-green-500/5 hover:border-green-500 hover:bg-green-500/10 text-green-700";
      case "Ocupada": return "border-red-500/30 bg-red-500/5 hover:border-red-500 hover:bg-red-500/10 text-red-700";
      case "Manutenção": return "border-purple-500/30 bg-purple-500/5 hover:border-purple-500 hover:bg-purple-500/10 text-purple-700";
      case "Defeito Ar": return "border-amber-500/30 bg-amber-500/5 hover:border-amber-500 hover:bg-amber-500/10 text-amber-700";
      case "Alagamento": return "border-blue-500/30 bg-blue-500/5 hover:border-blue-500 hover:bg-blue-500/10 text-blue-700";
      default: return "border-gray-500/30 bg-gray-500/5 text-gray-700";
    }
  };

  const statusDinamico = (room as any).statusDinamico || room.status || "Livre";
  const colors = getStatusColors(statusDinamico);

  return (
    <div
      ref={setNodeRef}
      className={`p-3 rounded-xl border-2 transition-all duration-300 flex flex-col items-center justify-between min-w-[130px] h-[120px] ${
        isOver
          ? "border-primary bg-primary/20 scale-105 shadow-glow"
          : colors
      } ${statusDinamico !== "Livre" ? "opacity-80" : "cursor-pointer"}`}
    >
      <div className="flex flex-col items-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Sala</span>
        <span className="text-lg font-bold">{room.nome}</span>
        {room.bloco && (
          <span className="text-[10px] font-medium opacity-80">Bloco {room.bloco}</span>
        )}
      </div>

      <div className="w-full flex flex-col items-center gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
        <Select 
          value={room.status || "Livre"} 
          onValueChange={(val) => onStatusChange && onStatusChange(room.id, room.nome, val)}
        >
          <SelectTrigger className="h-6 text-[10px] w-full px-2 py-0 border-black/10 dark:border-white/10 bg-background/50 shadow-sm focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Livre" className="text-[10px]">Livre</SelectItem>
            <SelectItem value="Ocupada" className="text-[10px]">Ocupada</SelectItem>
            <SelectItem value="Manutenção" className="text-[10px]">Em Manutenção</SelectItem>
            <SelectItem value="Defeito Ar" className="text-[10px]">Defeito no Ar</SelectItem>
            <SelectItem value="Alagamento" className="text-[10px]">Alagamento</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-[9px] font-medium opacity-80 whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">
          {nextUse ? `Uso: ${nextUse}` : "Uso: Livre"}
        </span>
      </div>
    </div>
  );
}

function DroppableMaintenanceZone() {
  const { isOver, setNodeRef } = useDroppable({
    id: "zone-maintenance",
  });

  return (
    <div
      ref={setNodeRef}
      className={`p-4 rounded-xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center min-w-[140px] h-[85px] cursor-pointer ${
        isOver
          ? "border-purple-500 bg-purple-500/20 scale-105 shadow-glow"
          : "border-purple-500/30 bg-purple-500/5 hover:border-purple-500 hover:bg-purple-500/10"
      }`}
    >
      <span className="text-[10px] text-purple-600 font-semibold uppercase tracking-wider">Interditar</span>
      <span className="text-xs font-bold text-purple-700 dark:text-purple-400">🔧 Em Manutenção</span>
      <span className="text-[9px] text-purple-600/70 text-center font-medium">Arraste uma turma aqui</span>
    </div>
  );
}

function DraggableStatusCard({ status }: { status: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `status-${status}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.6 : 1,
    cursor: "grab",
  };

  const statusConfigs: Record<string, { label: string; colorClass: string; icon: string }> = {
    "Livre": { label: "Livre", colorClass: "bg-green-500/10 text-green-500 border-green-500/30", icon: "🟢" },
    "Ocupada": { label: "Ocupada", colorClass: "bg-red-500/10 text-red-500 border-red-500/30", icon: "🔴" },
    "Manutenção": { label: "Manutenção", colorClass: "bg-purple-500/10 text-purple-500 border-purple-500/30", icon: "🔧" },
    "Alagamento": { label: "Alagamento", colorClass: "bg-blue-500/10 text-blue-500 border-blue-500/30", icon: "🌊" },
  };

  const config = statusConfigs[status] || { label: status, colorClass: "bg-muted text-muted-foreground", icon: "⚙️" };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`px-3 py-1.5 rounded-full border text-xs font-bold inline-flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95 transition-all ${config.colorClass}`}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </div>
  );
}

const EnsalamentoTab = ({ unidade }: { unidade: string }) => {
  // --- VARIÁVEIS CRÍTICAS E ESTADOS ---
  const [rows, setRows] = useState<Ensalamento[]>([]); // Linhas da tabela
  const [filterOnlyFreeSalas, setFilterOnlyFreeSalas] = useState(false);
  const [showDndPanel, setShowDndPanel] = useState(false);
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
  // Date picker de visualização (filtro da tabela)
  const [selectedViewDate, setSelectedViewDate] = useState<Date | undefined>(undefined);
  const [viewCalendarOpen, setViewCalendarOpen] = useState(false);
  // Date picker do formulário (data específica da aula)
  const [formCalendarOpen, setFormCalendarOpen] = useState(false);

  const [remanejarData, setRemanejarData] = useState<{ aula: Ensalamento, novaSala: string } | null>(null);

  const [salasOptions, setSalasOptions] = useState<SalaOption[]>([]);
  const [horariosOptions, setHorariosOptions] = useState<HorarioOption[]>([]);
  const [salaCustom, setSalaCustom] = useState(false);
  const [horarioCustom, setHorarioCustom] = useState(false);

  const [nextUses, setNextUses] = useState<Record<string, string>>({});

  const isSyncing = useRef(false);

  const getSalaStatusDinamico = (salaNome: string, blocoSala: string | null, statusBase: string | null): string => {
    if (statusBase && statusBase !== "Livre" && statusBase !== "Ocupada") {
      return statusBase;
    }

    const today = dayKey(now);
    if (!today) return statusBase || "Livre"; // Domingo

    const currentTurno = getCurrentTurno(now);

    // Modelo atômico: verifica se existe aula na sala hoje
    const todayOpts = { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
    const todayStr = now.toLocaleDateString('pt-BR', todayOpts);
    const [dd, mm, yyyy] = todayStr.split('/');
    const todayISO = `${yyyy}-${mm}-${dd}`;

    const isOcupada = rows.some((row) => {
      if (row.sala !== salaNome) return false;
      if (row.turno !== currentTurno) return false;
      // Modelo atômico: tem disciplina e data é hoje
      if (row.disciplina && row.data === todayISO) return true;
      // Fallback legado: coluna do dia da semana
      const conteudoHoje = (row as any)[today];
      return conteudoHoje && conteudoHoje.trim() !== "";
    });

    return isOcupada ? "Ocupada" : "Livre";
  };

  const uniqueSalasOptions = useMemo(() => {
    const seen = new Set<string>();
    return salasOptions.filter(s => {
      const key = `${s.nome}-${s.bloco || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [salasOptions]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // --- FUNÇÕES DE BUSCA E CARREGAMENTO ---
  // Busca as aulas no banco; filtra por data específica quando selectedViewDate estiver definida
  const load = async (viewDate?: Date) => {
    setLoading(true);
    let query = supabase
      .from("ensalamento")
      .select("*")
      .eq("unidade", unidade)
      .order("sort_order")
      .order("turno")
      .order("horario");

    // Quando uma data de visualização está selecionada, filtra no banco
    const effectiveDate = viewDate !== undefined ? viewDate : selectedViewDate;
    if (effectiveDate) {
      query = query.eq("data", format(effectiveDate, "yyyy-MM-dd"));
    }

    const { data, error } = await query;
    if (error) toast.error("Erro ao carregar", { description: error.message });
    setRows((data as Ensalamento[]) ?? []);
    setLoading(false);
  };

  const loadOptions = async () => {
    const [salasRes, horariosRes] = await Promise.all([
      supabase.from("salas").select("id, nome, bloco, status").eq("unidade", unidade).order("nome"),
      supabase.from("horarios").select("id, turno, hora_inicio, hora_fim").order("turno").order("hora_inicio"),
    ]);
    setSalasOptions((salasRes.data as SalaOption[]) ?? []);
    setHorariosOptions((horariosRes.data as HorarioOption[]) ?? []);
  };

  const loadNextUses = async () => {
    // Busca registros futuros ou de hoje para calcular o "Próximo uso"
    const todayOpts = { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
    const todayStr = new Date().toLocaleDateString('pt-BR', todayOpts);
    const [dd, mm, yyyy] = todayStr.split('/');
    const todayISO = `${yyyy}-${mm}-${dd}`;

    const { data } = await supabase.from("ensalamento")
      .select("sala, data, horario, disciplina")
      .eq("unidade", unidade)
      .gte("data", todayISO)
      .order("data")
      .order("horario");
      
    if (data) {
      const uses: Record<string, string> = {};
      data.forEach(r => {
        if (!uses[r.sala]) {
          const date = new Date(r.data + "T12:00:00");
          const dateStr = date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
          uses[r.sala] = `${dateStr}, ${r.horario}`;
        }
      });
      setNextUses(uses);
    }
  };

  // Recarrega ao trocar de unidade OU ao mudar a data de visualização
  useEffect(() => { load(); loadOptions(); loadNextUses(); }, [unidade]); // eslint-disable-line

  // Refetch automático quando a data de visualização muda
  useEffect(() => { load(selectedViewDate); }, [selectedViewDate]); // eslint-disable-line

  // Sincroniza salas da tabela de ensalamento para a tabela de salas caso esta esteja vazia
  const syncSalasFromEnsalamento = async (currentSalas: SalaOption[], currentRows: Ensalamento[]) => {
    if (isSyncing.current || currentSalas.length > 0 || currentRows.length === 0) return;
    isSyncing.current = true;

    // Filtra salas únicas das aulas
    const uniqueRooms = Array.from(new Set(currentRows.map(r => r.sala).filter(Boolean)));
    if (uniqueRooms.length === 0) return;

    try {
      const salasParaInserir = uniqueRooms.map(salaNome => {
        const correspondingRow = currentRows.find(r => r.sala === salaNome);
        return {
          nome: salaNome,
          bloco: correspondingRow?.bloco || null,
          status: "Livre",
          unidade: unidade
        };
      });

      const { error } = await supabase.from("salas").insert(salasParaInserir);
      if (error) throw error;

      toast.success(`${salasParaInserir.length} salas importadas automaticamente com status 'Livre'!`, {
        description: "Você pode alterar o status delas a qualquer momento na aba de Salas."
      });

      // Recarrega as salas para atualizar o dropdown e o PND
      const { data: newSalas } = await supabase
        .from("salas")
        .select("id, nome, bloco, status")
        .eq("unidade", unidade)
        .order("nome");
      if (newSalas) {
        setSalasOptions(newSalas as SalaOption[]);
      }
    } catch (e: any) {
      console.error("Erro ao sincronizar salas:", e);
    }
  };

  useEffect(() => {
    if (!loading && rows.length > 0 && salasOptions.length === 0) {
      syncSalasFromEnsalamento(salasOptions, rows);
    }
  }, [loading, rows, salasOptions]);

  // useEffect para carregar salas com select('*') e manter atualizado
  useEffect(() => {
    const fetchSalas = async () => {
      const { data, error } = await supabase
        .from("salas")
        .select("*")
        .eq("unidade", unidade)
        .order("nome");
      if (!error && data) {
        setSalasOptions((data as SalaOption[]) ?? []);
      }
    };
    fetchSalas();
  }, [unidade, remanejarData]);

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
    setForm({ ...empty });
    setSalaCustom(false);
    setHorarioCustom(false);
    setFormCalendarOpen(false);
    setOpen(true);
  };

  // openEdit: preenche o formulário com dados do modelo atômico
  const openEdit = (r: Ensalamento) => {
    setEditing(r);
    setForm({
      sala: r.sala, 
      bloco: r.bloco ?? "", 
      turno: r.turno, 
      horario: r.horario,
      professor: r.professor ?? "", 
      data: r.data ?? "",
      disciplina: r.disciplina ?? "",
    });
    const salaExists = salasOptions.some((s) => s.nome === r.sala);
    setSalaCustom(!salaExists);
    const horarioExists = horariosOptions.some((h) => `${h.hora_inicio}-${h.hora_fim}` === r.horario);
    setHorarioCustom(!horarioExists);
    setFormCalendarOpen(false);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.sala || !form.horario || !form.turno) { toast.error("Preencha sala, turno e horário"); return; }
    if (!form.disciplina) { toast.error("Preencha o nome da disciplina"); return; }

    // Payload atômico: um registro = uma aula em uma data específica
    const payload = {
      sala: form.sala,
      bloco: form.bloco || null,
      turno: form.turno,
      horario: form.horario,
      professor: form.professor || null,
      data: form.data || null,
      disciplina: form.disciplina || null,
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
    toast.success("Excluído");
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Se o elemento arrastado for um card de Status (Livre, Ocupada, Manutenção, Alagamento)
    if (activeId.startsWith("status-")) {
      const newStatus = activeId.replace("status-", "");
      if (overId.startsWith("room-")) {
        const roomName = overId.replace("room-", "");
        const targetSala = uniqueSalasOptions.find(s => s.nome === roomName);
        if (targetSala) {
          await handleAlterarStatusSala(targetSala.id, targetSala.nome, newStatus);
        }
      }
      return;
    }

    // Se solto na zona de manutenção
    if (overId === "zone-maintenance") {
      const turmaId = String(active.id);
      const turma = rows.find(r => r.id === turmaId);
      if (!turma || !turma.sala) {
        toast.error("Esta turma já está sem sala alocada!");
        return;
      }

      const correspondingSala = uniqueSalasOptions.find(s => s.nome === turma.sala);
      if (!correspondingSala) {
        toast.error(`Não foi possível encontrar a Sala ${turma.sala} no cadastro de salas.`);
        return;
      }

      await handleAlterarStatusSala(correspondingSala.id, correspondingSala.nome, "Manutenção");
      return;
    }

    // Se solto em um bloco de sala livre (Zona de Remanejamento Rápido)
    if (overId.startsWith("room-")) {
      const roomName = overId.replace("room-", "");
      const turmaId = String(active.id);

      const targetSala = uniqueSalasOptions.find(s => s.nome === roomName);
      if (targetSala) {
        const statusDinamico = getSalaStatusDinamico(targetSala.nome, targetSala.bloco, targetSala.status);
        if (['Manutenção', 'Alagamento', 'Ocupada', 'Defeito Ar'].includes(statusDinamico)) {
          toast.error(`Ação bloqueada: A sala ${targetSala.nome} está atualmente com status de ${statusDinamico}`);
          return;
        }
      }
      
      const bloco = targetSala?.bloco || null;

      setLoading(true);
      try {
        const { error } = await supabase
          .from("ensalamento")
          .update({ sala: roomName, bloco: bloco })
          .eq("id", turmaId);

        if (error) throw error;
        toast.success(`Turma remanejada para Sala ${roomName}!`);
        load();
      } catch (err: any) {
        toast.error("Erro ao remanejar via DnD", { description: err.message });
      } finally {
        setLoading(false);
      }
      return;
    }

    // Comportamento original de reordenação de linhas
    if (active.id !== over.id) {
      const oldIndex = rows.findIndex((i) => i.id === active.id);
      const newIndex = rows.findIndex((i) => i.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newArray = arrayMove(rows, oldIndex, newIndex);
        setRows(newArray);

        const updates = newArray.map((item, index) => ({ id: item.id, sort_order: index }));
        try {
          await Promise.all(
            updates.map((u) =>
              supabase.from("ensalamento").update({ sort_order: u.sort_order }).eq("id", u.id)
            )
          );
          toast.success("Ordem atualizada!");
        } catch (e) {
          toast.error("Erro ao salvar ordem");
        }
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
      setRows([]); // <--- Fixes the counter state bug
      load();
      loadOptions();
    }
    setLoading(false);
  };

  // --- NOVAS FUNÇÕES DOS BOTÕES (LÓGICA VISUAL) ---

  // Função atrelada ao novo botão de Buscar Salas Livres no topo.
  // Ao ser clicado, faz o toggle do filtro de salas livres.
  const handleBuscarSalasLivres = async () => {
    if (!filterOnlyFreeSalas) {
      setLoading(true);
      await loadOptions();
      setLoading(false);
    }
    setFilterOnlyFreeSalas((prev) => !prev);
  };

  // Função atrelada ao ícone de Remanejar nas ações da tabela.
  // Ao ser clicado, deverá abrir o modal para remanejar a turma cujo ID foi passado.
  const handleRemanejarTurma = async (id: string) => {
    const aula = rows.find(r => r.id === id);
    if (aula) {
      setLoading(true);
      await loadOptions(); // Busca dados atualizados (status) do banco instantes antes de abrir o modal
      setLoading(false);
      setRemanejarData({ aula, novaSala: "" });
    }
  };

  const handleConfirmarRemanejamento = async () => {
    if (!remanejarData?.novaSala) return;

    const targetSala = uniqueSalasOptions.find(s => s.nome === remanejarData.novaSala);
    if (targetSala) {
      const statusDinamico = getSalaStatusDinamico(targetSala.nome, targetSala.bloco, targetSala.status);
      if (['Manutenção', 'Alagamento', 'Ocupada', 'Defeito Ar'].includes(statusDinamico)) {
        toast.error(`Ação bloqueada: A sala ${targetSala.nome} está atualmente com status de ${statusDinamico}`);
        return;
      }
    }

    const bloco = targetSala?.bloco || null;

    setLoading(true);
    try {
      const { error } = await supabase.from("ensalamento")
        .update({ sala: remanejarData.novaSala, bloco: bloco }).eq("id", remanejarData.aula.id);
      if (error) throw error;
      toast.success("Turma remanejada com sucesso!");
      setRemanejarData(null);
      load();
      loadOptions();
    } catch (err: any) {
      toast.error("Erro ao remanejar", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAlterarStatusSala = async (salaId: string, salaNome: string, newStatus: string) => {
    setLoading(true);
    try {
      const { error: salaError } = await supabase
        .from("salas")
        .update({ status: newStatus })
        .eq("id", salaId);
      if (salaError) throw salaError;

      if (["Manutenção", "Defeito Ar", "Alagamento"].includes(newStatus)) {
        const { error: ensalamentoError } = await supabase
          .from("ensalamento")
          .update({ sala: "", bloco: null })
          .eq("sala", salaNome)
          .eq("unidade", unidade);
        if (ensalamentoError) throw ensalamentoError;
        toast.success(`Sala ${salaNome} colocada em ${newStatus}. Todas as turmas alocadas nela foram desvinculadas!`);
      } else {
        toast.success(`Status da Sala ${salaNome} alterado para ${newStatus}!`);
      }

      await load();
      await loadOptions();

      if (remanejarData && remanejarData.aula.sala === salaNome && ["Manutenção", "Defeito Ar", "Alagamento"].includes(newStatus)) {
        setRemanejarData({
          ...remanejarData,
          aula: { ...remanejarData.aula, sala: "", bloco: null }
        });
      }
    } catch (err: any) {
      toast.error("Erro ao alterar status da sala", { description: err.message });
    } finally {
      setLoading(false);
    }
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

      if (filterOnlyFreeSalas) {
        const correspondingSala = uniqueSalasOptions.find((s) => s.nome === r.sala);
        const statusDinamico = correspondingSala 
          ? getSalaStatusDinamico(correspondingSala.nome, correspondingSala.bloco, correspondingSala.status)
          : "Livre";
        if (statusDinamico !== "Livre") return false;
      }

      if (!q) return true;
      const fields = [
        r.sala, r.professor ?? "", r.bloco ?? "", r.horario, turnoLabels[r.turno] ?? r.turno,
        r.segunda ?? "", r.terca ?? "", r.quarta ?? "", r.quinta ?? "", r.sexta ?? "", r.sabado ?? "",
      ];
      return fields.some((f) => normalizeSearch(f).includes(q));
    });
  }, [rows, search, andarFilter, blocoFilter, filterOnlyFreeSalas, uniqueSalasOptions]);

  const handleSalaSelect = (value: string) => {
    if (value === "__custom__") {
      setSalaCustom(true);
      setForm({ ...form, sala: "", bloco: "" });
      return;
    }
    setSalaCustom(false);
    const sala = uniqueSalasOptions.find((s) => s.nome === value);
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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-4 animate-fade-in">
        {/* --- CABEÇALHO E FILTROS --- */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Ensalamento</h2>
            <p className="text-muted-foreground text-sm">{rows.length} aula{rows.length === 1 ? "" : "s"} cadastrada{rows.length === 1 ? "" : "s"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Picker de Visualização — filtra tabela por data específica */}
            <Popover open={viewCalendarOpen} onOpenChange={setViewCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`w-[180px] justify-start text-left font-normal ${
                    selectedViewDate ? "border-primary text-primary" : "text-muted-foreground"
                  }`}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedViewDate
                    ? format(selectedViewDate, "dd/MM/yyyy", { locale: ptBR })
                    : "Filtrar por data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedViewDate}
                  onSelect={(date) => {
                    setSelectedViewDate(date);
                    setViewCalendarOpen(false);
                  }}
                  locale={ptBR}
                  initialFocus
                />
                {selectedViewDate && (
                  <div className="p-2 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSelectedViewDate(undefined);
                        setViewCalendarOpen(false);
                      }}
                    >
                      <X className="w-3 h-3 mr-1" /> Limpar data
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

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

            {/* BOTÃO: Exportar Planilha (multi-tenant: respeita filtro de unidade) */}
            <Button
              onClick={() => {
                exportToCSV(rows, unidade);
                toast.success("Planilha exportada!", {
                  description: `Apenas dados da unidade '${unidade}' foram exportados.`
                });
              }}
              variant="outline"
              disabled={rows.length === 0}
              className="hover:border-green-500 hover:text-green-600 transition-smooth"
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar Planilha
            </Button>

            {/* BOTÃO ADICIONADO: Buscar Salas Livres */}
            <Button
              onClick={handleBuscarSalasLivres}
              variant={filterOnlyFreeSalas ? "default" : "outline"}
              className={`transition-smooth ${filterOnlyFreeSalas
                ? "bg-green-600 hover:bg-green-700 text-white shadow-glow"
                : "hover:border-primary hover:text-primary bg-background/50"
                }`}
            >
              <Search className="w-4 h-4 mr-2" />
              {filterOnlyFreeSalas ? "Ver Todas as Salas" : "Buscar Salas Livres"}
            </Button>

            {/* BOTÃO ADICIONADO: Painel DnD */}
            <Button
              onClick={() => setShowDndPanel(prev => !prev)}
              variant={showDndPanel ? "default" : "outline"}
              className={`transition-smooth ${showDndPanel
                ? "bg-amber-600 hover:bg-amber-700 text-white shadow-glow"
                : "hover:border-amber-500 hover:text-amber-500 bg-background/50"
                }`}
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              {showDndPanel ? "Ocultar Painel DnD" : "Painel DnD"}
            </Button>

            <Button variant="destructive" onClick={() => setClearConfirmOpen(true)}>
              <Trash2 className="w-4 h-4 mr-2" /> Limpar Registros
            </Button>
            <Button onClick={openNew} className="gradient-brand border-0 shadow-brand">
              <Plus className="w-4 h-4 mr-2" /> Nova Aula
            </Button>
          </div>
        </div>

        {/* PAINEL DE REMANEJAMENTO RÁPIDO (DND) */}
        {showDndPanel && (
          <div className="glass-card p-6 border-amber-500/30 bg-amber-500/5 rounded-2xl animate-fade-in space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-amber-800 dark:text-amber-400 flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 animate-pulse" />
                  Zonas de Remanejamento Rápido (Drag & Drop)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Arraste uma turma da tabela (pelo ícone de ordenação <GripVertical className="inline w-3.5 h-3.5" />) e solte-a em uma das salas livres abaixo para remanejar instantaneamente.
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-amber-800 dark:text-amber-400 hover:bg-amber-500/10"
                onClick={() => setShowDndPanel(false)}
              >
                Fechar
              </Button>
            </div>

            {/* BARRA DE STATUS DRAGGABLES */}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-background/40 border border-border/50 rounded-xl">
              <span className="text-xs text-muted-foreground font-semibold">🔧 Alterar Status da Sala (Arrastar no bloco):</span>
              <DraggableStatusCard status="Livre" />
              <DraggableStatusCard status="Ocupada" />
              <DraggableStatusCard status="Manutenção" />
              <DraggableStatusCard status="Alagamento" />
            </div>

            <div className="flex flex-col gap-6">
              {/* ZONA DE SALAS LIVRES */}
              <div>
                <h4 className="text-sm font-semibold text-green-700/80 mb-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Salas Livres (Arraste aqui)
                </h4>
                <div className="flex flex-wrap items-center gap-3">
                  {uniqueSalasOptions
                    .map(s => ({ ...s, statusDinamico: getSalaStatusDinamico(s.nome, s.bloco, s.status) }))
                    .filter(s => s.statusDinamico === 'Livre').map((room) => (
                      <DroppableRoomBlock 
                        key={room.id} 
                        room={{ ...room, status: room.statusDinamico }} 
                        nextUse={nextUses[room.nome]}
                        onStatusChange={handleAlterarStatusSala}
                      />
                    ))}
                  {uniqueSalasOptions
                    .map(s => ({ ...s, statusDinamico: getSalaStatusDinamico(s.nome, s.bloco, s.status) }))
                    .filter(s => s.statusDinamico === 'Livre').length === 0 && (
                    <p className="text-sm text-muted-foreground py-4">Nenhuma sala livre disponível no momento.</p>
                  )}
                  <div className="h-10 w-px bg-border/60 mx-1 hidden sm:block"></div>
                  <DroppableMaintenanceZone />
                </div>
              </div>

              {/* ZONA DE SALAS INATIVAS/COM PROBLEMA */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 border-t pt-4">
                  Salas Inativas / Ocupadas
                </h4>
                <div className="flex flex-wrap items-center gap-3">
                  {uniqueSalasOptions
                    .map(s => ({ ...s, statusDinamico: getSalaStatusDinamico(s.nome, s.bloco, s.status) }))
                    .filter(s => s.statusDinamico !== 'Livre').map((room) => (
                      <DroppableRoomBlock 
                        key={room.id} 
                        room={{ ...room, status: room.statusDinamico }} 
                        nextUse={nextUses[room.nome]}
                        onStatusChange={handleAlterarStatusSala}
                      />
                    ))}
                  {uniqueSalasOptions
                    .map(s => ({ ...s, statusDinamico: getSalaStatusDinamico(s.nome, s.bloco, s.status) }))
                    .filter(s => s.statusDinamico !== 'Livre').length === 0 && (
                    <p className="text-sm text-muted-foreground py-4">Todas as salas estão livres.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TABELA DE AULAS --- */}
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Sala</TableHead>
                  <TableHead>Bloco</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Disciplina</TableHead>
                  <TableHead>Professor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={14} className="text-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin inline" />
                  </TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    {selectedViewDate
                      ? `Nenhuma aula em ${format(selectedViewDate, "dd/MM/yyyy", { locale: ptBR })}`
                      : "Nenhum registro"}
                  </TableCell></TableRow>
                ) : (
                  <SortableContext items={filtered.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    {filtered.map((r) => {
                      // Se a aula tem data específica, verificar se é hoje
                      const today = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
                      const [dd, mm, yyyy] = today.split('/');
                      const todayISO = `${yyyy}-${mm}-${dd}`;
                      const aaulaDataMatch = r.data ? r.data === todayISO : true;
                      // Se tem data e não é hoje (ex: domingo sem aulas), não exibe como ao vivo
                      const st = aaulaDataMatch ? statusFor(r.horario, now) : (r.data && r.data < todayISO ? "done" : "scheduled");
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
                          <TableCell>
                            {/* Data formatada */}
                            {r.data
                              ? <span className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                  {format(new Date(r.data + 'T12:00:00'), 'dd/MM', { locale: ptBR })}
                                </span>
                              : <span className="text-[10px] text-muted-foreground">Recorrente</span>}
                          </TableCell>
                          <TableCell className="font-semibold">{r.sala}</TableCell>
                          <TableCell>{r.bloco ?? "—"}</TableCell>
                          <TableCell className="capitalize">{turnoLabels[r.turno] ?? r.turno}</TableCell>
                          <TableCell className="tabular-nums">{r.horario}</TableCell>
                          <TableCell className="text-sm max-w-48 truncate font-medium">
                            {/* Modelo atômico: lê disciplina; fallback para dados legados */}
                            {r.disciplina
                              ? r.disciplina
                              : "—"}
                          </TableCell>
                          <TableCell>{r.professor ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {/* BOTÃO ADICIONADO: Remanejar Turma */}
                              {/* Fica na extrema esquerda das ações com cor indicativa (Amber/Laranja) para remanejamento */}
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleRemanejarTurma(r.id)}
                                className="text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 transition-smooth"
                                title="Remanejar Turma"
                              >
                                <ArrowRightLeft className="w-4 h-4" />
                              </Button>

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
          </div>
        </div>

        {/* --- MODAL DE EDIÇÃO E CRIAÇÃO --- */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto glass-strong">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editing ? "✏️ Editar aula" : "➕ Nova aula"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Modelo atômico: cada registro representa <strong>uma única aula</strong> em uma data/horário específico.
              </p>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* LINHA 1: Data + Horário lado a lado */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm font-medium">
                    <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                    Data da Aula
                  </Label>
                  <Popover open={formCalendarOpen} onOpenChange={setFormCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full justify-start text-left font-normal h-10 ${
                          form.data ? "border-primary text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className="truncate text-sm">
                          {form.data
                            ? format(new Date(form.data + "T12:00:00"), "dd/MM/yy (EEE)", { locale: ptBR })
                            : "Selecionar..."}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={form.data ? new Date(form.data + "T12:00:00") : undefined}
                        onSelect={(date) => {
                          setForm({ ...form, data: date ? format(date, "yyyy-MM-dd") : "" });
                          setFormCalendarOpen(false);
                        }}
                        locale={ptBR}
                        initialFocus
                      />
                      {form.data && (
                        <div className="p-2 border-t border-border">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-muted-foreground hover:text-foreground text-xs"
                            onClick={() => { setForm({ ...form, data: "" }); setFormCalendarOpen(false); }}
                          >
                            <X className="w-3 h-3 mr-1" /> Sem data (recorrente)
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Horário *</Label>
                  {!horarioCustom && horariosOptions.length > 0 ? (
                    <Select value={form.horario} onValueChange={handleHorarioSelect}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Selecione um horário" /></SelectTrigger>
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
                      <Input value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} placeholder="08:00-10:00" className="flex-1 h-10" />
                      {horariosOptions.length > 0 && <Button variant="outline" size="sm" onClick={() => setHorarioCustom(false)}>↩</Button>}
                    </div>
                  )}
                </div>
              </div>

              {/* LINHA 2: Disciplina (full width — campo principal) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Disciplina *</Label>
                <Input
                  value={form.disciplina ?? ""}
                  onChange={(e) => setForm({ ...form, disciplina: e.target.value })}
                  placeholder="Ex: Anatomia Humana, Cálculo II, Direito Civil..."
                  className="h-10 text-sm"
                />
              </div>

              {/* LINHA 3: Professor + Sala + Bloco */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2 col-span-1">
                  <Label className="text-sm font-medium">Professor</Label>
                  <Input
                    value={form.professor ?? ""}
                    onChange={(e) => setForm({ ...form, professor: e.target.value })}
                    placeholder="Nome do prof..."
                    className="h-10 text-sm"
                  />
                </div>

                <div className="space-y-2 col-span-1">
                  <Label className="text-sm font-medium">Sala *</Label>
                  {!salaCustom && uniqueSalasOptions.length > 0 ? (
                    <Select value={form.sala} onValueChange={handleSalaSelect}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Sala" /></SelectTrigger>
                      <SelectContent>
                        {uniqueSalasOptions.map((s) => (
                          <SelectItem key={s.id} value={s.nome}>{s.nome}{s.bloco ? ` (Bl. ${s.bloco})` : ""}</SelectItem>
                        ))}
                        <SelectItem value="__custom__">✏️ Digitar...</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex gap-1">
                      <Input value={form.sala} onChange={handleSalaChange} placeholder="703" className="flex-1 h-10 text-sm" />
                      {uniqueSalasOptions.length > 0 && <Button variant="outline" size="sm" className="h-10 px-2" onClick={() => setSalaCustom(false)}>↩</Button>}
                    </div>
                  )}
                </div>

                <div className="space-y-2 col-span-1">
                  <Label className="text-sm font-medium">Bloco</Label>
                  <Input
                    value={form.bloco ?? ""}
                    onChange={(e) => setForm({ ...form, bloco: e.target.value })}
                    placeholder="Ex: A"
                    className="h-10 text-sm"
                  />
                </div>
              </div>

              {/* LINHA 4: Turno */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Turno *</Label>
                <Select value={form.turno} onValueChange={(v) => setForm({ ...form, turno: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manha">☀️ Manhã</SelectItem>
                    <SelectItem value="tarde">🌤️ Tarde</SelectItem>
                    <SelectItem value="noite">🌙 Noite</SelectItem>
                    <SelectItem value="integral">📚 Integral</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Resumo visual do que será salvo */}
              {(form.disciplina || form.horario) && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs space-y-1">
                  <p className="font-semibold text-primary text-xs uppercase tracking-wide">Preview do registro</p>
                  {form.data && <p>📅 <strong>{format(new Date(form.data + "T12:00:00"), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</strong></p>}
                  {form.horario && <p>⏰ <strong>{form.horario}</strong></p>}
                  {form.disciplina && <p>📝 {form.disciplina}</p>}
                  {form.professor && <p>👤 {form.professor}</p>}
                  {form.sala && <p>🏠 Sala {form.sala}{form.bloco ? `, Bloco ${form.bloco}` : ""}</p>}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} className="gradient-brand border-0">{editing ? "Salvar" : "Criar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {/* MODAL DE REMANEJAMENTO */}
        <Dialog open={!!remanejarData} onOpenChange={(v) => !v && setRemanejarData(null)}>
          <DialogContent className="glass-strong">
            <DialogHeader><DialogTitle>Remanejar Turma</DialogTitle></DialogHeader>
            {remanejarData && (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-muted/50 rounded-lg border border-border">
                  <p className="text-sm text-muted-foreground mb-1">Disciplina / Detalhes</p>
                  <p className="font-medium text-foreground">
                    {remanejarData.aula.disciplina || remanejarData.aula.segunda || remanejarData.aula.terca || remanejarData.aula.quarta || remanejarData.aula.professor || "Aula sem disciplina especificada"}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-muted-foreground">Sala atual:</span>
                    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-md text-sm font-semibold">{remanejarData.aula.sala || "Sem sala"}</span>
                  </div>

                  {remanejarData.aula.sala && (
                    <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-border/50 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-medium">Alterar Status da Sala {remanejarData.aula.sala}:</span>
                        <Select
                          value={uniqueSalasOptions.find(s => s.nome === remanejarData.aula.sala)?.status || "Livre"}
                          onValueChange={async (newStatus) => {
                            const targetSala = uniqueSalasOptions.find(s => s.nome === remanejarData.aula.sala);
                            if (targetSala) {
                              await handleAlterarStatusSala(targetSala.id, targetSala.nome, newStatus);
                            }
                          }}
                        >
                          <SelectTrigger className="w-[150px] h-8 text-xs">
                            <SelectValue placeholder="Status..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Livre">🟢 Livre</SelectItem>
                            <SelectItem value="Ocupada">🔴 Ocupada</SelectItem>
                            <SelectItem value="Manutenção">🔧 Em Manutenção</SelectItem>
                            <SelectItem value="Defeito Ar">⚠️ Defeito no Ar</SelectItem>
                            <SelectItem value="Alagamento">🌊 Alagamento</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Selecione a Nova Sala</Label>
                  <Select value={remanejarData.novaSala} onValueChange={(v) => setRemanejarData({ ...remanejarData, novaSala: v })}>
                    <SelectTrigger><SelectValue placeholder="Escolha uma sala..." /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {/* GRUPO 1: Salas Livres (Rótulo verde) */}
                        <SelectLabel className="text-green-600 font-bold">Salas Livres</SelectLabel>
                        {uniqueSalasOptions
                          .map(s => ({ ...s, statusDinamico: getSalaStatusDinamico(s.nome, s.bloco, s.status) }))
                          .filter(s => s.statusDinamico === 'Livre').map(s => (
                            <SelectItem key={s.id} value={s.nome}>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                <span>Sala {s.nome} {s.bloco ? `(Bloco ${s.bloco})` : ""} ({s.statusDinamico})</span>
                              </div>
                            </SelectItem>
                          ))}
                        {uniqueSalasOptions
                          .map(s => ({ ...s, statusDinamico: getSalaStatusDinamico(s.nome, s.bloco, s.status) }))
                          .filter(s => s.statusDinamico === 'Livre').length === 0 && (
                          <div className="px-8 py-2 text-sm text-muted-foreground">Nenhuma sala livre no momento</div>
                        )}
                      </SelectGroup>
                      <SelectGroup>
                        {/* GRUPO 2: Salas Indisponíveis/Em Manutenção (Rótulo roxo) */}
                        <SelectLabel className="text-purple-600 font-bold pt-4">Salas Indisponíveis / Em Manutenção</SelectLabel>
                        {uniqueSalasOptions
                          .map(s => ({ ...s, statusDinamico: getSalaStatusDinamico(s.nome, s.bloco, s.status) }))
                          .filter(s => ['Ocupada', 'Manutenção', 'Defeito Ar', 'Alagamento'].includes(s.statusDinamico)).map(s => (
                            <SelectItem key={s.id} value={s.nome}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${s.statusDinamico === 'Ocupada' ? 'bg-red-500' : 'bg-purple-500'}`}></div>
                                <span>Sala {s.nome} {s.bloco ? `(Bloco ${s.bloco})` : ""} ({s.statusDinamico})</span>
                              </div>
                            </SelectItem>
                          ))}
                        {uniqueSalasOptions
                          .map(s => ({ ...s, statusDinamico: getSalaStatusDinamico(s.nome, s.bloco, s.status) }))
                          .filter(s => ['Ocupada', 'Manutenção', 'Defeito Ar', 'Alagamento'].includes(s.statusDinamico)).length === 0 && (
                          <div className="px-8 py-2 text-sm text-muted-foreground">Nenhuma sala nesta categoria</div>
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemanejarData(null)}>Cancelar</Button>
              <Button onClick={handleConfirmarRemanejamento} disabled={!remanejarData?.novaSala || remanejarData.novaSala === remanejarData.aula.sala} className="gradient-brand border-0">Confirmar Remanejamento</Button>
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
    </DndContext>
  );
};

export default EnsalamentoTab;
