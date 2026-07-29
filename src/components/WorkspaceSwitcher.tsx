import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Plus } from 'lucide-react';
import { fetcher, poster } from '@/lib/fetcher';
import { switchWorkspace } from '@/lib/panelAuth';
import { cn } from '@/lib/utils';

type WorkspaceSummary = {
  id: string;
  name: string;
  _count?: { leads: number; whatsappConnections: number };
};

/**
 * Troca de cliente. Um painel, N clientes, isolados por workspace_id — que já é
 * o filtro de todas as rotas do backend.
 *
 * Fica no header e não escondido em Configurações: saber QUAL cliente está na
 * tela é pré-requisito pra ler qualquer número dela. Enterrar isso num menu é
 * como se ganha o hábito de olhar o dado do cliente errado.
 */
export function WorkspaceSwitcher() {
  const [items, setItems] = useState<WorkspaceSummary[]>([]);
  const [current, setCurrent] = useState<WorkspaceSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([fetcher('/workspaces'), fetcher('/workspace')])
      .then(([all, mine]) => {
        setItems(all);
        setCurrent(mine);
      })
      .catch(() => {
        // Servidor antigo (sem a rota) ou sem permissão: some em vez de
        // quebrar o header inteiro.
        setItems([]);
      });
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const pick = async (id: string) => {
    if (id === current?.id) return setOpen(false);
    setBusy(true);
    setError(null);
    try {
      await switchWorkspace(id); // recarrega a página em caso de sucesso
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const createNew = async () => {
    const name = prompt('Nome do novo cliente:');
    if (!name?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const ws = await poster('/workspaces', { name: name.trim() });
      await switchWorkspace(ws.id);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  // Com um cliente só o seletor continua aparecendo de propósito: o nome do
  // cliente na tela vale mais que o espaço no header. Some apenas se as rotas
  // falharem (servidor antigo), pra não deixar um botão morto no lugar.
  if (items.length === 0 && !current) return null;

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60"
      >
        <Building2 className="h-3.5 w-3.5 text-gray-400" />
        <span className="max-w-[160px] truncate">{current?.name || 'Cliente'}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <p className="border-b border-gray-100 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-400">
            Clientes
          </p>

          <div className="max-h-72 overflow-y-auto py-1">
            {items.map((w) => {
              const active = w.id === current?.id;
              return (
                <button
                  key={w.id}
                  onClick={() => pick(w.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50',
                    active && 'bg-blue-50/60'
                  )}
                >
                  <span className="min-w-0">
                    <span className={cn('block truncate', active ? 'font-semibold text-blue-700' : 'text-gray-700')}>
                      {w.name}
                    </span>
                    <span className="block text-[11px] text-gray-400">
                      {w._count?.leads ?? 0} leads · {w._count?.whatsappConnections ?? 0} números
                    </span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                </button>
              );
            })}
          </div>

          <button
            onClick={createNew}
            disabled={busy}
            className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            <Plus className="h-4 w-4 text-gray-400" />
            Novo cliente
          </button>

          {error && <p className="border-t border-gray-100 px-3 py-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
