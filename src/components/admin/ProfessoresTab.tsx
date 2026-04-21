import { CrudTab } from "./CrudTab";

const ProfessoresTab = () => (
  <CrudTab
    table="professores"
    title="Professores"
    description="Cadastro de professores da unidade"
    fields={[
      { key: "nome", label: "Nome", required: true },
      { key: "email", label: "E-mail", type: "email" },
      { key: "departamento", label: "Departamento" },
      { key: "disciplinas", label: "Disciplinas" },
    ]}
    columns={[
      { key: "nome", label: "Nome" },
      { key: "email", label: "E-mail" },
      { key: "departamento", label: "Departamento" },
      { key: "disciplinas", label: "Disciplinas" },
    ]}
    emptyForm={{ nome: "", email: "", departamento: "", disciplinas: "" }}
  />
);
export default ProfessoresTab;
