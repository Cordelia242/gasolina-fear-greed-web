export function Header({ updatedAt, hasError }: { updatedAt: string | null; hasError: boolean }) {
  const label = hasError
    ? 'No se pudieron cargar los datos'
    : updatedAt
      ? `Actualizado ${new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(updatedAt))}`
      : 'Cargando…';

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">SANTA CRUZ · BOLIVIA</p>
        <h1>Gasolina Index</h1>
        <p className="subtitle">No hice esto antes porque pense que iba a mejorar</p>
      </div>
      <div className="updated-wrap">
        <div className="updated">
          <span className="dot" style={hasError ? { background: '#e2807a' } : undefined} />
          <span>{label}</span>
        </div>
        <p className="update-freq">Se actualiza cada 30 minutos</p>
      </div>
    </header>
  );
}
