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
    ]}
    columns={[
      { key: "nome", label: "Nome" },
      { key: "email", label: "E-mail" },
      { key: "departamento", label: "Departamento" },
    ]}
    emptyForm={{ nome: "", email: "", departamento: "" }}
  />
);
export default ProfessoresTab;
