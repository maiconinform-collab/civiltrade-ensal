import { CrudTab } from "./CrudTab";

const DisciplinasTab = ({ unidade }: { unidade: string }) => (
  <CrudTab
    unidade={unidade}
    table="disciplinas"
    title="Disciplinas"
    description="Cadastro de disciplinas/matérias"
    fields={[
      { key: "nome", label: "Nome", required: true },
      { key: "codigo", label: "Código" },
      { key: "carga_horaria", label: "Carga horária (h)", type: "number" },
    ]}
    columns={[
      { key: "nome", label: "Nome" },
      { key: "codigo", label: "Código" },
      { key: "carga_horaria", label: "Carga horária" },
    ]}
    emptyForm={{ nome: "", codigo: "", carga_horaria: "" }}
  />
);
export default DisciplinasTab;
