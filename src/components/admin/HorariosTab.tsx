import { CrudTab } from "./CrudTab";

const HorariosTab = ({ unidade }: { unidade: string }) => (
  <CrudTab
    unidade={unidade}
    table="horarios"
    title="Horários"
    description="Slots de horário por turno"
    fields={[
      { key: "turno", label: "Turno", required: true, placeholder: "manha / tarde / noite" },
      { key: "hora_inicio", label: "Hora início", type: "time", required: true },
      { key: "hora_fim", label: "Hora fim", type: "time", required: true },
      { key: "dia_semana", label: "Dia da semana (opcional)" },
    ]}
    columns={[
      { key: "turno", label: "Turno" },
      { key: "hora_inicio", label: "Início" },
      { key: "hora_fim", label: "Fim" },
      { key: "dia_semana", label: "Dia" },
    ]}
    emptyForm={{ turno: "", hora_inicio: "", hora_fim: "", dia_semana: "" }}
  />
);
export default HorariosTab;
