import { Toolbar } from "@/components/ui/toolbar";

export default function DemoOne() {
  return (
    <Toolbar
      groups={[
        {
          id: "history",
          label: "Historico",
          items: [
            { id: "undo", label: "Desfazer", variant: "icon" },
            { id: "redo", label: "Refazer", variant: "icon" }
          ]
        },
        {
          id: "formatting",
          label: "Formatacao",
          items: [
            { id: "bold", label: "Negrito", variant: "text", isActive: true },
            { id: "italic", label: "Italico", variant: "text" },
            { id: "paragraph", label: "Texto", variant: "text" },
            { id: "h2", label: "H2", variant: "text" },
            { id: "h3", label: "H3", variant: "text" },
            { id: "list", label: "Lista", variant: "text" },
            { id: "ordered", label: "1.", variant: "text" },
            { id: "quote", label: "Citar", variant: "text" },
            { id: "comment", label: "Comentar", variant: "text" }
          ]
        }
      ]}
    />
  );
}
