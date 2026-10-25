"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>No pudimos cargar este espacio</h1>
        <p className="muted">
          Inténtalo de nuevo. Si el problema continúa, contacta al
          administrador.
        </p>
        <button className="button" onClick={reset}>
          Reintentar
        </button>
      </section>
    </main>
  );
}
