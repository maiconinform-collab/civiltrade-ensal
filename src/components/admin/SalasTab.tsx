import { CrudTab } from "./CrudTab";

const SalasTab = ({ unidade }: { unidade: string }) => (
  <CrudTab
    unidade={unidade}
    table="salas"
    title="Salas"
    description="Cadastro de salas físicas"
    fields={[
      { key: "nome", label: "Nome/Número", required: true, placeholder: "Ex: 101" },
      { key: "bloco", label: "Bloco", placeholder: "Ex: A" },
      { key: "capacidade", label: "Capacidade", type: "number" },
    ]}
    columns={[
      { key: "nome", label: "Sala" },
      { key: "bloco", label: "Bloco" },
      { key: "capacidade", label: "Capacidade" },
    ]}
    emptyForm={{ nome: "", bloco: "", capacidade: "" }}
  />
);
export default SalasTab;
