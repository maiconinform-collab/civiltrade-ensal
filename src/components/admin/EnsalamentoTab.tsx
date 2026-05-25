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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator,
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Pencil, Trash2, Loader2, Search, GripVertical, Upload, ArrowRightLeft, Download, CalendarIcon, X, Check, ChevronsUpDown } from "lucide-react";
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

type SalaOption = { id: string; nome: string; bloco: string | null; status?: string; capacidade?: number | null; };
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
  onStatusChange?: (name: string, status: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `room-${room.nome}`,
  });

  const getStatusColors = (status: string) => {
    switch (status) {
      case "Livre": return "border-green-500/30 bg-green-500/5";
      case "Ocupada": return "border-red-500/30 bg-red-500/5";
      case "Manutenção": return "border-purple-500/30 bg-purple-500/5";
      case "Defeito Ar": return "border-amber-500/30 bg-amber-500/5";
      case "Alagamento": return "border-blue-500/30 bg-blue-500/5";
      default: return "border-gray-500/30 bg-gray-500/5";
    }
  };

  const statusDinamico = room.statusDinamico || room.status || "Livre";
  const colors = getStatusColors(statusDinamico);

  return (
    <div
      ref={setNodeRef}
      className={`p-4 border rounded-xl shadow-sm flex flex-col justify-between bg-card transition-all duration-300 min-w-[150px] h-[135px] ${isOver ? "border-primary scale-105 shadow-glow" : colors
        } ${statusDinamico !== "Livre" ? "opacity-80" : "cursor-pointer"}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sala</span>
          <span className="text-2xl font-bold">{room.nome}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          {room.capacidade && (
            <span className="text-[10px] font-medium bg-muted/50 px-1.5 rounded text-muted-foreground">cap {room.capacidade}</span>
          )}
          {room.bloco && (
            <span className="text-[10px] font-medium opacity-80">Bl. {room.bloco}</span>
          )}
        </div>
      </div>

      <div className="w-full flex flex-col gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
        <Select
          value={statusDinamico}
          onValueChange={(val) => {
            if (onStatusChange) onStatusChange(room.nome, val);
          }}
        >
          <SelectTrigger className={`h-7 text-xs ${statusDinamico === 'Livre' ? 'text-green-700 bg-green-500/10 border-green-500/20' : ''} ${statusDinamico === 'Manutenção' ? 'text-purple-700 bg-purple-500/10 border-purple-500/20' : ''} ${statusDinamico === 'Ocupada' ? 'text-red-700 bg-red-500/10 border-red-500/20' : ''}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Livre">🟢 Livre</SelectItem>
            <SelectItem value="Ocupada">🔴 Ocupada</SelectItem>
            <SelectItem value="Manutenção">🔧 Manutenção</SelectItem>
            <SelectItem value="Defeito Ar">⚠️ Defeito Ar</SelectItem>
            <SelectItem value="Alagamento">🌊 Alagamento</SelectItem>
          </SelectContent>
        </Select>
        {nextUse && statusDinamico === "Livre" && (
          <span className="text-[9px] text-muted-foreground truncate w-full">Uso: {nextUse}</span>
        )}
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
      className={`p-4 rounded-xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center min-w-[140px] h-[85px] cursor-pointer ${isOver
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
  const [showDndPanel, setShowDndPanel] = useState(true); // Sempre visível por padrão (único painel de salas)
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [andarFilter, setAndarFilter] = useState("todos");
  const [blocoFilter, setBlocoFilter] = useState("todos");
  const [open, setOpen] = useState(false);
  const [salaComboboxOpen, setSalaComboboxOpen] = useState(false);
  const [editing, setEditing] = useState<Ensalamento | null>(null);
  const [form, setForm] = useState(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  // Filtros Globais da Tabela e DnD
  const [selectedViewDate, setSelectedViewDate] = useState<Date | undefined>(undefined);
  const [turnoFilter, setTurnoFilter] = useState("todos");
  const [viewCalendarOpen, setViewCalendarOpen] = useState(false);
  // Date picker do formulário (data específica da aula)
  const [formCalendarOpen, setFormCalendarOpen] = useState(false);

  const [remanejarData, setRemanejarData] = useState<{ aula: Ensalamento, novaSala: string } | null>(null);
  const [loadingModal, setLoadingModal] = useState(false);
  // Estado para confirmação de DnD em sala com problema
  const [dndConfirmData, setDndConfirmData] = useState<{
    turmaId: string;
    roomName: string;
    bloco: string | null;
    statusAlvo: string;
  } | null>(null);

  const [salasOptions, setSalasOptions] = useState<SalaOption[]>([]);
  const [horariosOptions, setHorariosOptions] = useState<HorarioOption[]>([]);
  const [salaCustom, setSalaCustom] = useState(false);
  const [horarioCustom, setHorarioCustom] = useState(false);

  const [nextUses, setNextUses] = useState<Record<string, string>>({});

  const isSyncing = useRef(false);

  const getSalaStatusDinamico = (salaNome: string, blocoSala: string | null, statusBase: string | null, targetDateISO?: string, targetTurno?: string): string => {
    // Retorna diretamente qualquer status explícito que NÃO seja "Livre".
    // Isso garante que "Manutenção", "Defeito Ar", "Alagamento" E "Ocupada"
    // definidos manualmente no banco (ou via update otimístico) sejam respeitados.
    if (statusBase && statusBase !== "Livre") {
      return statusBase;
    }

    const todayOpts = { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
    const todayStr = now.toLocaleDateString('pt-BR', todayOpts);
    const [dd, mm, yyyy] = todayStr.split('/');
    const defaultTodayISO = `${yyyy}-${mm}-${dd}`;

    let dateISO = targetDateISO;
    if (!dateISO) {
      if (selectedViewDate) {
        const dStr = selectedViewDate.toLocaleDateString('pt-BR', todayOpts);
        const [d, m, y] = dStr.split('/');
        dateISO = `${y}-${m}-${d}`;
      } else {
        dateISO = defaultTodayISO;
      }
    }

    let turno = targetTurno;
    if (!turno) {
      turno = turnoFilter !== "todos" ? turnoFilter : getCurrentTurno(now);
    }

    const todayDayKey = dayKey(now); // For legacy fallback

    const isOcupada = rows.some((row) => {
      if (row.sala !== salaNome) return false;
      if (row.turno !== turno) return false;

      // Modelo atômico:
      if (row.disciplina && row.data === dateISO) return true;

      // Fallback legado:
      if (!row.disciplina && dateISO === defaultTodayISO) {
        const conteudoHoje = (row as any)[todayDayKey || ""];
        return conteudoHoje && conteudoHoje.trim() !== "";
      }
      return false;
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

  const fallbackSalasOptions: SalaOption[] = useMemo(() => {
    const andaresBase = {
      "7º Andar": ["703", "704", "705", "706"],
      "8º Andar": ["801", "802", "803", "805", "806"],
      "9º Andar": ["901", "902", "903", "906", "907"],
      "11º Andar": ["1101", "1102", "1103", "1104"]
    };
    const fallback: SalaOption[] = [];
    Object.entries(andaresBase).forEach(([bloco, salas]) => {
      // ID vazio indica sala ainda não persistida no banco (sem UUID real)
      salas.forEach(nome => fallback.push({ id: "", nome, bloco, status: "Livre" }));
    });
    return fallback;
  }, []);

  const currentSalasOptions = uniqueSalasOptions.length > 0 ? uniqueSalasOptions : fallbackSalasOptions;

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
      supabase.from("salas").select("id, nome, bloco, status, capacidade").eq("unidade_id", unidade).order("nome"),
      supabase.from("horarios").select("id, turno, hora_inicio, hora_fim").order("turno").order("hora_inicio"),
    ]);

    let rawSalas = (salasRes.data as SalaOption[]) || [];

    // VERIFICAÇÃO E INJEÇÃO AUTOMÁTICA DE SALAS BASE
    // Garante que a infraestrutura completa esteja sempre disponível e nunca seja perdida.
    const andaresBase = {
      "7º Andar": ["703", "704", "705", "706"],
      "8º Andar": ["801", "802", "803", "805", "806"],
      "9º Andar": ["901", "902", "903", "906", "907"],
      "11º Andar": ["1101", "1102", "1103", "1104"]
    };

    const salasEsperadasMap = new Map<string, string>();
    Object.entries(andaresBase).forEach(([bloco, salas]) => {
      salas.forEach(sala => salasEsperadasMap.set(sala, bloco));
    });

    const nomesExistentes = new Set(rawSalas.map(s => s.nome));
    const salasFaltantes = Array.from(salasEsperadasMap.keys()).filter(sala => !nomesExistentes.has(sala));

    if (salasFaltantes.length > 0) {
      const salasParaInserir = salasFaltantes.map(salaNome => ({
        nome: salaNome,
        bloco: salasEsperadasMap.get(salaNome) || null,
        status: "Livre",
        unidade_id: unidade
      }));

      // Insere as salas faltantes de forma segura e limpa
      const { error: insertError } = await supabase.from("salas").insert(salasParaInserir);
      if (insertError) {
        console.error("Erro ao injetar salas base:", insertError);
      }

      // Busca a lista atualizada com os IDs gerados
      const { data: recarregadas } = await supabase.from("salas").select("id, nome, bloco, status, capacidade").eq("unidade_id", unidade).order("nome");
      if (recarregadas) rawSalas = recarregadas as SalaOption[];
    }

    // Filtragem de duplicatas na interface (Fallback de Segurança)
    const uniqueMap = new Map<string, SalaOption>();
    rawSalas.forEach(s => {
      if (!uniqueMap.has(s.nome)) uniqueMap.set(s.nome, s);
    });
    const uniqueSalas = Array.from(uniqueMap.values());

    setSalasOptions(uniqueSalas);
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

  // Sincroniza salas da tabela de ensalamento para a tabela de salas caso esta esteja vazia (importação de planilha etc)
  const syncSalasFromEnsalamento = async (currentSalas: SalaOption[], currentRows: Ensalamento[]) => {
    if (isSyncing.current || currentSalas.length > 0 || currentRows.length === 0) return;
    isSyncing.current = true;

    // Filtra salas únicas das aulas
    const uniqueRooms = Array.from(new Set(currentRows.map(r => r.sala).filter(Boolean)));
    if (uniqueRooms.length === 0) return;

    try {
      const salasParaInserir = uniqueRooms.map(salaNome => {
        const correspondingRow = currentRows.find(r => r.sala === salaNome);
        const isAndar11 = ["1101", "1102", "1103", "1104"].includes(salaNome);
        return {
          nome: salaNome,
          bloco: isAndar11 ? "11º Andar" : (correspondingRow?.bloco || null),
          status: "Livre",
          unidade_id: unidade
        };
      });

      // Operação estrita de insert para evitar conflitos
      const { error } = await supabase.from("salas").insert(salasParaInserir);
      if (error) throw error;

      toast.success(`${salasParaInserir.length} salas importadas automaticamente com status 'Livre'!`, {
        description: "Você pode alterar o status delas a qualquer momento na aba de Salas."
      });

      // Recarrega as salas para atualizar o dropdown e o PND
      const { data: newSalas } = await supabase
        .from("salas")
        .select("id, nome, bloco, status, capacidade")
        .eq("unidade_id", unidade)
        .order("nome");

      if (newSalas) {
        // Aplica o filtro de unicidade antes do set (segurança extra)
        const uniqueMap = new Map<string, SalaOption>();
        newSalas.forEach(s => {
          if (!uniqueMap.has(s.nome)) uniqueMap.set(s.nome, s as SalaOption);
        });
        setSalasOptions(Array.from(uniqueMap.values()));
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
        .eq("unidade_id", unidade)
        .order("nome");
      if (!error && data) {
        if (data.length === 0) {
          // Se o banco de dados estiver vazio, aciona a injeção automática de salas base
          await loadOptions();
        } else {
          setSalasOptions((data as SalaOption[]) ?? []);
        }
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

    // Trava Anti-Conflito (Double Booking)
    if (form.sala) {
      const isConflict = rows.some((r) => {
        if (editing && r.id === editing.id) return false; // Ignora o próprio registro
        if (r.sala !== form.sala) return false;
        if (r.turno !== form.turno && r.horario !== form.horario) return false;

        // Se ambos são do modelo atômico, compara a data. 
        // Se form.data for vazio, é aula recorrente (legado). Aulas recorrentes chocam no mesmo turno/horário.
        if (form.data && r.data) {
          if (r.data === form.data) return true;
          return false;
        }

        return true; // Se um deles é recorrente, assume conflito direto
      });

      if (isConflict) {
        toast.error(`Conflito de Agenda: A sala ${form.sala} já está reservada para esta data e horário.`);
        return;
      }
    }

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
        const targetSala = currentSalasOptions.find(s => s.nome === roomName);
        if (targetSala) {
          await handleAlterarStatusSala(targetSala.nome, newStatus);
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

      const correspondingSala = currentSalasOptions.find(s => s.nome === turma.sala);
      if (!correspondingSala) {
        toast.error(`Não foi possível encontrar a Sala ${turma.sala} no cadastro de salas.`);
        return;
      }

      await handleAlterarStatusSala(correspondingSala.nome, "Manutenção");
      return;
    }

    // Se solto em um bloco de sala livre (Zona de Remanejamento Rápido)
    if (overId.startsWith("room-")) {
      const roomName = overId.replace("room-", "");
      const turmaId = String(active.id);
      const turma = rows.find(r => r.id === turmaId);

      const targetSala = currentSalasOptions.find(s => s.nome === roomName);

      const bloco = targetSala?.bloco || null;

      if (targetSala) {
        const targetDate = turma?.data || undefined;
        const targetTurno = turma?.turno || undefined;
        const statusDinamico = getSalaStatusDinamico(targetSala.nome, targetSala.bloco, targetSala.status, targetDate, targetTurno);

        // ✅ FIX: Em vez de bloquear, abre AlertDialog de confirmação
        if (['Manutenção', 'Alagamento', 'Ocupada', 'Defeito Ar'].includes(statusDinamico)) {
          setDndConfirmData({ turmaId, roomName, bloco, statusAlvo: statusDinamico });
          return; // Pausa, aguarda confirmação do usuário
        }
      }

      // Sala livre: executa direto
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
    const { error: errorSalas } = await supabase.from("salas").delete().eq("unidade_id", unidade);
    if (error || errorSalas) {
      toast.error("Erro ao limpar registros", { description: error?.message || errorSalas?.message });
    } else {
      toast.success("Todos os registros e salas da unidade foram limpos!");
      setClearConfirmOpen(false);
      setRows([]);
      setSalasOptions([]);
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
      // Abre o modal primeiro para evitar tela em branco
      setRemanejarData({ aula, novaSala: "" });
      setLoadingModal(true);
      await loadOptions(); // Busca dados atualizados (status) do banco instantes antes de exibir as opções
      setLoadingModal(false);
    }
  };

  const handleConfirmarRemanejamento = async () => {
    if (!remanejarData?.novaSala) return;

    const targetSala = currentSalasOptions.find(s => s.nome === remanejarData.novaSala);
    if (targetSala) {
      const targetDate = remanejarData.aula.data || undefined;
      const targetTurno = remanejarData.aula.turno || undefined;
      const statusDinamico = getSalaStatusDinamico(targetSala.nome, targetSala.bloco, targetSala.status, targetDate, targetTurno);
      if (statusDinamico && statusDinamico !== 'Livre') {
        const confirmacao = window.confirm(
          `Atenção: A sala ${targetSala.nome} encontra-se com o status '${statusDinamico}'. Tem certeza que deseja transferir a turma para esta sala mesmo assim?`
        );
        if (!confirmacao) return; // Aborta a operação se o usuário clicar em Cancelar
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

  const handleAlterarStatusSala = async (salaNome: string, newStatus: string) => {
    try {
      // 1. Tente Fazer o Update Primeiro
      const { data: updateData, error: updateError } = await supabase
        .from("salas")
        .update({ status: newStatus })
        .eq("nome", salaNome)
        .eq("unidade_id", unidade)
        .select();

      if (updateError) throw updateError;

      // 2. Fallback para INSERT se a sala ainda não existir no banco
      if (!updateData || updateData.length === 0) {
        const localSala = currentSalasOptions.find(s => s.nome === salaNome);
        const blocoVal = localSala?.bloco || null;
        const capVal = localSala?.capacidade || null;

        const { error: insertError } = await supabase
          .from("salas")
          .insert([{
            nome: salaNome,
            unidade_id: unidade,
            status: newStatus,
            bloco: blocoVal,
            capacidade: capVal
          }])
          .select();

        if (insertError) {
          toast.error("Erro ao criar a sala no banco de dados.");
          return;
        }
      }

      // Desvincula turmas se status for de interdição
      if (["Manutenção", "Defeito Ar", "Alagamento"].includes(newStatus)) {
        const { error: ensalamentoError } = await supabase
          .from("ensalamento")
          .update({ sala: "", bloco: null })
          .eq("sala", salaNome)
          .eq("unidade", unidade);
        if (ensalamentoError) throw ensalamentoError;
      }

      // B) HARD REFETCH: busca as salas frescas do Supabase e injeta no estado
      const { data: freshSalas, error: fetchError } = await supabase
        .from("salas")
        .select("id, nome, bloco, status, capacidade")
        .eq("unidade_id", unidade)
        .order("nome");
      if (fetchError) throw fetchError;

      if (freshSalas) {
        const uniqueMap = new Map<string, SalaOption>();
        freshSalas.forEach((s: any) => {
          if (!uniqueMap.has(s.nome)) uniqueMap.set(s.nome, s as SalaOption);
        });
        setSalasOptions(Array.from(uniqueMap.values()));
      }

      // Reload ensalamento rows também (sequencial)
      await load();

      // C) Toast APÓS o refetch confirmar o novo estado
      if (["Manutenção", "Defeito Ar", "Alagamento"].includes(newStatus)) {
        toast.success(`Sala ${salaNome} colocada em ${newStatus}. Todas as turmas alocadas nela foram desvinculadas!`);
      } else {
        toast.success(`Status da Sala ${salaNome} alterado para ${newStatus}!`);
      }

      // Atualiza modal de remanejamento se necessário
      if (remanejarData && remanejarData.aula.sala === salaNome && ["Manutenção", "Defeito Ar", "Alagamento"].includes(newStatus)) {
        setRemanejarData({
          ...remanejarData,
          aula: { ...remanejarData.aula, sala: "", bloco: null }
        });
      }
    } catch (err: any) {
      toast.error("Erro ao alterar status da sala", { description: err.message });
    }
  };

  // --- FILTROS E PESQUISA ---
  // Calcula andares e blocos únicos com base em todas as salas que existem no banco, não apenas as que tem aula
  const andaresUnicos = useMemo(() => Array.from(new Set(currentSalasOptions.map(s => getAndarNumero(s.nome)).filter(Boolean))).sort((a, b) => a! - b!), [currentSalasOptions]);
  const blocosUnicos = useMemo(() => Array.from(new Set(currentSalasOptions.map(s => s.bloco).filter(Boolean))).sort(), [currentSalasOptions]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return rows.filter((r) => {
      if (andarFilter !== "todos" && getAndarNumero(r.sala)?.toString() !== andarFilter) return false;
      if (blocoFilter !== "todos" && r.bloco !== blocoFilter) return false;
      if (turnoFilter !== "todos" && r.turno !== turnoFilter) return false;

      if (filterOnlyFreeSalas) {
        const correspondingSala = currentSalasOptions.find((s) => s.nome === r.sala);
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
  }, [rows, search, andarFilter, blocoFilter, filterOnlyFreeSalas, currentSalasOptions]);

  const handleSalaSelect = (value: string) => {
    if (value === "__custom__") {
      setSalaCustom(true);
      setForm({ ...form, sala: "", bloco: "" });
      return;
    }
    setSalaCustom(false);
    const sala = currentSalasOptions.find((s) => s.nome === value);
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
                  className={`w-[180px] justify-start text-left font-normal ${selectedViewDate ? "border-primary text-primary" : "text-muted-foreground"
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

            <Select value={turnoFilter} onValueChange={setTurnoFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos Turnos</SelectItem>
                <SelectItem value="Manhã">Manhã</SelectItem>
                <SelectItem value="Tarde">Tarde</SelectItem>
                <SelectItem value="Noite">Noite</SelectItem>
                <SelectItem value="Integral">Integral</SelectItem>
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
          <div className="glass-card p-6 border-amber-500/30 bg-amber-500/5 rounded-2xl animate-fade-in space-y-5 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-amber-800 dark:text-amber-400 flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 animate-pulse" />
                  Painel de Ferramentas DnD (Remanejamento e Status)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Arraste uma turma da tabela (pelo ícone de ordenação <GripVertical className="inline w-3.5 h-3.5" />) e solte-a em uma sala abaixo para remanejar. Use os badges coloridos para alterar o status da sala via arrastar.
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
              <span className="text-xs text-muted-foreground font-semibold">🔧 Arraste o status desejado sobre o bloco da sala:</span>
              <DraggableStatusCard status="Livre" />
              <DraggableStatusCard status="Ocupada" />
              <DraggableStatusCard status="Manutenção" />
              <DraggableStatusCard status="Alagamento" />
            </div>

            {/* ZONA DE INTERDIÇÃO + GRID DE SALAS DROPPABLE */}
            <div className="space-y-4">
              {/* Zona de Manutenção rápida (DnD de turma) */}
              <div className="flex flex-col items-start gap-2">
                <span className="text-xs text-muted-foreground font-semibold">Enviar turma diretamente para Manutenção (DnD):</span>
                <DroppableMaintenanceZone />
              </div>

              {/* GRID DE SALAS DROPPABLE — principal área de remanejamento visual */}
              <div className="space-y-4">
                <span className="text-xs text-muted-foreground font-semibold">🏠 Arraste a turma até a sala de destino:</span>
                <div className="flex flex-col gap-6">
                  {andaresUnicos.map(andar => {
                    const salasDoAndar = currentSalasOptions
                      .map(s => ({ ...s, statusDinamico: getSalaStatusDinamico(s.nome, s.bloco, s.status) }))
                      .filter(s => getAndarNumero(s.nome) === andar);

                    if (salasDoAndar.length === 0) return null;

                    return (
                      <div key={`dnd-andar-${andar}`} className="space-y-2">
                        <div className="flex items-center gap-3 border-b border-amber-500/20 pb-1">
                          <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400">{andar}º Andar</h4>
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">{salasDoAndar.length} salas</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-3">
                          {salasDoAndar.map(room => (
                            <div key={`dnd-room-${room.id}-${room.statusDinamico}`} className="flex flex-col gap-1.5">
                              <DroppableRoomBlock
                                key={`block-${room.id}-${room.statusDinamico}`}
                                room={{ ...room, status: room.statusDinamico }}
                                nextUse={nextUses[room.nome]}
                                onStatusChange={handleAlterarStatusSala}
                              />
                              {/* Botões rápidos de interdição conectados a handleAlterarStatusSala */}
                              <div className="flex gap-1">
                                <button
                                  title="Colocar em Manutenção"
                                  className="flex-1 text-[9px] font-semibold py-1 px-1.5 rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-500 transition-all active:scale-95"
                                  onClick={() => handleAlterarStatusSala(room.nome, 'Manutenção')}
                                >
                                  🔧 Manutenção
                                </button>
                                <button
                                  title="Liberar Sala"
                                  className="flex-1 text-[9px] font-semibold py-1 px-1.5 rounded-lg bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/30 hover:bg-green-500/20 hover:border-green-500 transition-all active:scale-95"
                                  onClick={() => handleAlterarStatusSala(room.nome, 'Livre')}
                                >
                                  🟢 Liberar
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {currentSalasOptions.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma sala disponível. Importe os dados ou aguarde o carregamento.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SEÇÃO 'Visão Geral das Salas' REMOVIDA — o Painel DnD acima agora é a única central de gestão visual */}

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
                        className={`w-full justify-start text-left font-normal h-10 ${form.data ? "border-primary text-foreground" : "text-muted-foreground"
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
                  <Popover open={salaComboboxOpen} onOpenChange={setSalaComboboxOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={salaComboboxOpen}
                        className="w-full justify-between h-10 text-sm font-normal"
                        disabled={loading && currentSalasOptions.length === 0}
                      >
                        {loading && currentSalasOptions.length === 0 ? "Carregando..." : (form.sala
                          ? currentSalasOptions.find((s) => s.nome === form.sala)?.nome || form.sala
                          : "Selecionar sala...")}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0" align="start">
                      <Command
                        filter={(value, search) => {
                          const sala = currentSalasOptions.find(s => s.nome.toLowerCase() === value.toLowerCase());
                          if (!sala) return 0;
                          const combined = `${sala.nome} ${sala.bloco || ""}`.toLowerCase();
                          if (combined.includes(search.toLowerCase())) return 1;
                          return 0;
                        }}
                      >
                        <CommandInput placeholder="Buscar sala..." />
                        <CommandList>
                          <CommandEmpty>Nenhuma sala encontrada.</CommandEmpty>
                          <CommandGroup>
                            {currentSalasOptions.map((s) => (
                              <CommandItem
                                key={s.id}
                                value={s.nome}
                                onSelect={(currentValue) => {
                                  setForm({ ...form, sala: currentValue, bloco: s.bloco ?? "" });
                                  setSalaComboboxOpen(false);
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${form.sala === s.nome ? "opacity-100" : "opacity-0"}`} />
                                {s.nome}{s.bloco ? ` (Bl. ${s.bloco})` : ""}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
          <DialogContent className="glass-strong max-w-lg">
            <DialogHeader><DialogTitle>🔁 Remanejar Turma</DialogTitle></DialogHeader>
            {/* ✅ FIX: Usa loadingModal em vez de loading para não bloquear o conteúdo do modal */}
            {loadingModal ? (
              <div className="py-8 flex flex-col items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-sm text-muted-foreground">Carregando salas disponíveis...</p>
              </div>
            ) : !remanejarData ? null : (
              <div className="space-y-4 py-2">
                {/* Informações da turma atual */}
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
                          value={(currentSalasOptions || fallbackSalasOptions).find(s => s.nome === remanejarData.aula.sala)?.status || "Livre"}
                          onValueChange={async (newStatus) => {
                            const targetSala = (currentSalasOptions || fallbackSalasOptions).find(s => s.nome === remanejarData.aula.sala);
                            if (targetSala) {
                              await handleAlterarStatusSala(targetSala.nome, newStatus);
                            }
                          }}
                        >
                          <SelectTrigger className="w-[160px] h-8 text-xs">
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

                {/* ✅ ALERTA INTELIGENTE: Aviso quando sala selecionada tem problema */}
                {remanejarData.novaSala && (() => {
                  const salaAlvo = (currentSalasOptions || fallbackSalasOptions).find(s => s.nome === remanejarData.novaSala);
                  const statusAlvo = salaAlvo ? getSalaStatusDinamico(salaAlvo.nome, salaAlvo.bloco, salaAlvo.status, remanejarData.aula.data || undefined, remanejarData.aula.turno) : 'Livre';
                  if (statusAlvo !== 'Livre') {
                    const statusIcons: Record<string, string> = {
                      'Manutenção': '🔧', 'Defeito Ar': '⚠️', 'Alagamento': '🌊', 'Ocupada': '🔴'
                    };
                    return (
                      <div className="flex items-start gap-3 p-3 rounded-xl border-2 border-amber-500/60 bg-amber-500/10 animate-fade-in">
                        <span className="text-xl mt-0.5">{statusIcons[statusAlvo] || '⚠️'}</span>
                        <div>
                          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                            Atenção: Sala {remanejarData.novaSala} com problema!
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                            Esta sala está atualmente com status <strong>"{statusAlvo}"</strong>. Confirmar o remanejamento pode resultar em conflito operacional. Verifique antes de prosseguir.
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="space-y-2">
                  <Label>Selecione a Nova Sala</Label>
                  {/* ✅ FIX: Usa encadeamento opcional seguro com fallback para garantir lista sempre visível */}
                  <Select value={remanejarData.novaSala} onValueChange={(v) => setRemanejarData({ ...remanejarData, novaSala: v })}>
                    <SelectTrigger><SelectValue placeholder="Escolha uma sala..." /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {/* GRUPO 1: Salas Livres (Rótulo verde) */}
                        <SelectLabel className="text-green-600 font-bold">✅ Salas Livres</SelectLabel>
                        {(currentSalasOptions.length > 0 ? currentSalasOptions : fallbackSalasOptions)
                          .map(s => ({ ...s, statusDinamico: getSalaStatusDinamico(s.nome, s.bloco, s.status, remanejarData.aula.data || undefined, remanejarData.aula.turno) }))
                          .filter(s => s.statusDinamico === 'Livre').map(s => (
                            <SelectItem key={s.id} value={s.nome}>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                <span>Sala {s.nome}{s.bloco ? ` (${s.bloco})` : ""}</span>
                              </div>
                            </SelectItem>
                          ))}
                        {(currentSalasOptions.length > 0 ? currentSalasOptions : fallbackSalasOptions)
                          .map(s => ({ ...s, statusDinamico: getSalaStatusDinamico(s.nome, s.bloco, s.status, remanejarData.aula.data || undefined, remanejarData.aula.turno) }))
                          .filter(s => s.statusDinamico === 'Livre').length === 0 && (
                            <div className="px-8 py-2 text-sm text-muted-foreground">Nenhuma sala livre no momento</div>
                          )}

                        <SelectSeparator />

                        {/* GRUPO 2: Salas com Problemas (selecionáveis mas com aviso) */}
                        <SelectLabel className="text-amber-600 dark:text-amber-400 font-bold mt-2">⚠️ Salas com Restrições</SelectLabel>
                        {(currentSalasOptions.length > 0 ? currentSalasOptions : fallbackSalasOptions)
                          .map(s => ({ ...s, statusDinamico: getSalaStatusDinamico(s.nome, s.bloco, s.status, remanejarData.aula.data || undefined, remanejarData.aula.turno) }))
                          .filter(s => s.statusDinamico !== 'Livre').map(s => (
                            <SelectItem key={s.id} value={s.nome}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${s.statusDinamico === 'Ocupada' ? 'bg-red-500' :
                                  s.statusDinamico === 'Manutenção' ? 'bg-purple-500' :
                                    s.statusDinamico === 'Defeito Ar' ? 'bg-amber-500' :
                                      'bg-blue-500'
                                  }`}></div>
                                <span>Sala {s.nome}{s.bloco ? ` (${s.bloco})` : ""}</span>
                                <span className="text-xs text-muted-foreground ml-auto">({s.statusDinamico})</span>
                              </div>
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemanejarData(null)}>Cancelar</Button>
              <Button
                onClick={handleConfirmarRemanejamento}
                disabled={!remanejarData?.novaSala || remanejarData?.novaSala === remanejarData?.aula?.sala || loadingModal}
                className="gradient-brand border-0"
              >
                Confirmar Remanejamento
              </Button>
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

        {/* ALERTA DE CONFIRMAÇÃO DnD — sala com problema */}
        <AlertDialog open={!!dndConfirmData} onOpenChange={(v) => !v && setDndConfirmData(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                ⚠️ Atenção: Sala com Problema!
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                A sala <strong>{dndConfirmData?.roomName}</strong> está atualmente com status de{" "}
                <strong className="text-amber-600 dark:text-amber-400">"{dndConfirmData?.statusAlvo}"</strong>.
                <br /><br />
                Deseja remanejar a turma para esta sala mesmo assim? Isso pode gerar um conflito operacional.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDndConfirmData(null)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={async () => {
                  if (!dndConfirmData) return;
                  const { turmaId, roomName, bloco } = dndConfirmData;
                  setDndConfirmData(null);
                  setLoading(true);
                  try {
                    const { error } = await supabase
                      .from("ensalamento")
                      .update({ sala: roomName, bloco })
                      .eq("id", turmaId);
                    if (error) throw error;
                    toast.success(`Turma remanejada para Sala ${roomName} (com restrição).`);
                    load();
                  } catch (err: any) {
                    toast.error("Erro ao remanejar", { description: err.message });
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Confirmar mesmo assim
              </AlertDialogAction>
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
