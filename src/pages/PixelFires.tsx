import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetcher } from '@/lib/fetcher';

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
};

export function PixelFires() {
  const [data, setData] = useState<FiresResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetcher(`/pixel-fires?page=${page}`).then(setData).finally(() => setLoading(false));
  }, [page]);

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800">Disparos de Pixel</h2>
      <p className="text-sm text-gray-500 -mt-4">
        {data ? `${data.total} eventos enviados ao pixel, com o retorno da plataforma.` : 'Eventos enviados ao pixel, com o retorno da plataforma.'}
      </p>

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
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-gray-500">Nenhum disparo realizado ainda.</TableCell></TableRow>
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
