import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
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

export function PixelFires() {
  const [items, setItems] = useState<Fire[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetcher('/pixel-fires').then(setItems).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800">Disparos de Pixel</h2>
      <p className="text-sm text-gray-500 -mt-4">Últimos 50 eventos enviados ao pixel, com o retorno da plataforma.</p>

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
    </div>
  );
}
