import * as React from 'react';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, MousePointerClick, CheckCircle2, Clock, TrendingUp, Filter } from 'lucide-react';
import { fetcher } from '@/lib/fetcher';

type RotatorReport = {
  id: string;
  name: string;
  short_code: string;
  distribution: string;
  active: boolean;
  total_clicks: number;
  matched_clicks: number;
  pending_clicks: number;
};

type Summary = {
  total_clicks: number;
  matched_clicks: number;
  pending_clicks: number;
  match_rate: number;
};

type ReportData = {
  summary: Summary;
  rotators: RotatorReport[];
};

function StatCard({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`p-3 rounded-xl bg-gray-50 ${color}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function exportCsv(rotators: RotatorReport[], from: string, to: string) {
  const header = 'Nome,Short Code,Distribuição,Ativo,Cliques,Casados,Pendentes,Taxa';
  const rows = rotators.map((r) =>
    [r.name, r.short_code, r.distribution, r.active ? 'Sim' : 'Não', r.total_clicks, r.matched_clicks, r.pending_clicks,
      r.total_clicks > 0 ? `${Math.round((r.matched_clicks / r.total_clicks) * 100)}%` : '0%'].join(',')
  );
  const period = from || to ? `_${from || ''}_${to || ''}` : '';
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-rotadores${period}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Reports() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fetchReport = async (f: string, t: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f) params.set('from', f);
      if (t) params.set('to', t);
      const result = await fetcher(`/reports/rotators?${params}`);
      setData(result);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReport('', ''); }, []);

  const summary = data?.summary;
  const rotators = data?.rotators ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Relatórios de Cliques</h2>
          <p className="text-sm text-gray-500">Desempenho dos rotadores por período.</p>
        </div>
        {data && (
          <Button variant="outline" size="sm" onClick={() => exportCsv(rotators, from, to)}>
            <Download className="w-4 h-4 mr-1" /> Exportar CSV
          </Button>
        )}
      </div>

      {/* Filtro de data */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-sm mt-1" />
            </div>
            <Button size="sm" onClick={() => fetchReport(from, to)} disabled={loading}>
              <Filter className="w-3 h-3 mr-1" /> {loading ? 'Carregando...' : 'Filtrar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setFrom(''); setTo(''); fetchReport('', ''); }}>
              Limpar
            </Button>
            <div className="flex gap-2 ml-auto">
              {[
                { label: 'Hoje', days: 0 },
                { label: '7 dias', days: 7 },
                { label: '30 dias', days: 30 },
              ].map(({ label, days }) => (
                <Button key={label} size="sm" variant="outline" onClick={() => {
                  const f = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
                  const t = new Date().toISOString().slice(0, 10);
                  setFrom(days === 0 ? t : f);
                  setTo(t);
                  fetchReport(days === 0 ? t : f, t);
                }}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de resumo */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total de cliques" value={summary.total_clicks} icon={<MousePointerClick className="w-5 h-5" />} color="text-blue-600" />
          <StatCard label="Viraram conversa" value={summary.matched_clicks} sub="Casados com lead" icon={<CheckCircle2 className="w-5 h-5" />} color="text-green-600" />
          <StatCard label="Pendentes" value={summary.pending_clicks} sub="Sem conversa ainda" icon={<Clock className="w-5 h-5" />} color="text-yellow-600" />
          <StatCard label="Taxa de conversão" value={`${summary.match_rate}%`} sub="Cliques → conversa" icon={<TrendingUp className="w-5 h-5" />} color={summary.match_rate >= 50 ? 'text-green-600' : summary.match_rate >= 20 ? 'text-yellow-600' : 'text-red-500'} />
        </div>
      )}

      {/* Tabela por rotador */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Por rotador</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead>Rotador</TableHead>
                <TableHead>Distribuição</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">Casados</TableHead>
                <TableHead className="text-right">Pendentes</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400">Carregando...</TableCell></TableRow>
              ) : rotators.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400">Nenhum rotador encontrado.</TableCell></TableRow>
              ) : rotators.map((r) => {
                const rate = r.total_clicks > 0 ? Math.round((r.matched_clicks / r.total_clicks) * 100) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {{ ROUND_ROBIN: 'Round-robin', WEIGHTED: 'Ponderado', FALLBACK: 'Fallback' }[r.distribution] || r.distribution}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={r.active ? 'default' : 'secondary'} className={r.active ? 'bg-green-100 text-green-700 text-xs' : 'text-xs'}>
                        {r.active ? 'Ativo' : 'Pausado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{r.total_clicks}</TableCell>
                    <TableCell className="text-right text-green-600 font-medium">{r.matched_clicks}</TableCell>
                    <TableCell className="text-right text-gray-400">{r.pending_clicks}</TableCell>
                    <TableCell className="text-right">
                      {rate === null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span className={`font-medium ${rate >= 50 ? 'text-green-600' : rate >= 20 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {rate}%
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
