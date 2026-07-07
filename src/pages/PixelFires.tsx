import { useEffect, useState } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetcher, downloadFile } from '@/lib/fetcher';

type Fire = {
  id: string;
  platform: string;
  event_name: string;
  action_source?: string | null;
  status: string;
  response?: string | null;
  value?: number | null;
  currency?: string | null;
  fired_at: string;
  lead?: { name?: string | null; phone_number: string } | null;
  stage?: { name: string } | null;
};

type FiresResponse = {
  items: Fire[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  eventTypes: string[];
};

export function PixelFires() {
  const [data, setData] = useState<FiresResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Filtros
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [eventFilter, setEventFilter] = useState('all');

  // String de query dos filtros (sem a página) — reutilizada no fetch e no export.
  const filterQuery = () => {
    const p = new URLSearchParams();
    if (dateFrom) p.set('from', dateFrom);
    if (dateTo) p.set('to', dateTo);
    if (eventFilter !== 'all') p.set('event', eventFilter);
    return p.toString();
  };

  const load = (opts?: { refresh?: boolean }) => {
    if (opts?.refresh) setRefreshing(true);
    else setLoading(true);
    const q = filterQuery();
    fetcher(`/pixel-fires?page=${page}${q ? `&${q}` : ''}`)
      .then(setData)
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  // Recarrega quando muda página ou filtro. Filtro volta pra página 1.
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, dateFrom, dateTo, eventFilter]);
  useEffect(() => { setPage(1); /* eslint-disable-next-line */ }, [dateFrom, dateTo, eventFilter]);

  const onDownload = async () => {
    setDownloading(true);
    try {
      const q = filterQuery();
      await downloadFile(`/pixel-fires/export${q ? `?${q}` : ''}`, `disparos-pixel-${new Date().toISOString().slice(0, 10)}.csv`);
    } finally {
      setDownloading(false);
    }
  };

  const items = data?.items ?? [];
  const eventTypes = data?.eventTypes ?? [];
  const hasFilter = !!(dateFrom || dateTo || eventFilter !== 'all');

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800">Disparos de Pixel</h2>
      <p className="text-sm text-gray-500 -mt-4">
        {data ? `${data.total} eventos enviados ao pixel, com o retorno da plataforma.` : 'Eventos enviados ao pixel, com o retorno da plataforma.'}
      </p>

      {/* Toolbar de filtros */}
      <div className="flex flex-wrap gap-3 items-center bg-white p-3 rounded-2xl shadow-sm border border-gray-200/60">
        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm w-[150px] bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 rounded-full px-3" />
          <span className="text-gray-400 text-sm">até</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm w-[150px] bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 rounded-full px-3" />
        </div>

        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="h-9 text-sm text-gray-700 font-medium bg-gray-50 border border-transparent rounded-full px-4 outline-none cursor-pointer focus:bg-white focus:border-blue-500"
        >
          <option value="all">Todos os eventos</option>
          {eventTypes.map((ev) => (
            <option key={ev} value={ev}>{ev}</option>
          ))}
        </select>

        {hasFilter && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); setEventFilter('all'); }} className="text-xs text-gray-400 hover:text-gray-600">limpar</button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={() => load({ refresh: true })} disabled={refreshing} title="Atualizar" className="text-blue-600 border-transparent bg-blue-50 hover:bg-blue-100 rounded-full w-10 h-10 p-0 flex items-center justify-center">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={onDownload} disabled={downloading || items.length === 0} title="Baixar dados (CSV)" className="text-blue-600 border-transparent bg-blue-50 hover:bg-blue-100 rounded-full w-10 h-10 p-0 flex items-center justify-center">
            <Download className={`w-4 h-4 ${downloading ? 'animate-pulse' : ''}`} />
          </Button>
        </div>
      </div>

      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead>Data de Disparo</TableHead>
              <TableHead>Conversa</TableHead>
              <TableHead>Retorno</TableHead>
              <TableHead>Etapa da Jornada</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Plataforma</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12">Carregando...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-gray-500">{hasFilter ? 'Nenhum disparo no filtro selecionado.' : 'Nenhum disparo realizado ainda.'}</TableCell></TableRow>
            ) : items.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="whitespace-nowrap">{new Date(f.fired_at).toLocaleString('pt-BR')}</TableCell>
                <TableCell>
                  <div className="font-medium">{f.lead?.name || '-'}</div>
                  <div className="text-xs text-gray-400">{f.lead?.phone_number}</div>
                </TableCell>
                <TableCell>
                  {f.status === 'success' ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">✓ Enviado</span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium" title={f.response || ''}>✕ Erro</span>
                  )}
                </TableCell>
                <TableCell>{f.stage?.name || '-'}</TableCell>
                <TableCell>
                  <span className="font-medium">{f.event_name}</span>
                  {f.value != null && <span className="text-xs text-gray-400 ml-1">{f.currency} {f.value}</span>}
                </TableCell>
                <TableCell>{f.platform}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Página {data.page} de {data.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
