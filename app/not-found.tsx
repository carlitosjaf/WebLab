import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell">
      <div
        className="container glass-card"
        style={{
          padding: "40px",
          display: "grid",
          gap: "18px",
          placeItems: "start",
          maxWidth: "720px"
        }}
      >
        <span className="muted">404</span>
        <h1 style={{ margin: 0 }}>Conteúdo não encontrado</h1>
        <p className="muted" style={{ margin: 0 }}>
          O recurso solicitado pode não existir ou não estar acessível para a sua equipe.
        </p>
        <Link className="button button-primary" href="/">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
