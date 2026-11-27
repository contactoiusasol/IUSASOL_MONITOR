import { useEffect, useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Box, Container, Stack, Typography, Card, Button, CircularProgress, Alert } from '@mui/material';
import { getDataForAllMegas } from 'src/lib/grafica21megas';
import { getToday } from 'src/lib/api/endpoints';
import { useNotify } from 'src/components/notify';

const NUM_MEGAS = 21;

const formatCell = (value) => {
  if (value === undefined || value === null) return 'NA';
  if (Array.isArray(value)) return value[0];
  return value;
};

const Tabla = () => {
  const notify = useNotify();
  const [date, setDate] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [allData, setAllData] = useState([]);
  const [lostMegas, setLostMegas] = useState([]);
  const [failedMegas, setFailedMegas] = useState([]);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      // Request using the selected date (handled as local date by helper)
      const results = await getDataForAllMegas(date);
      setAllData(results);

      // Detect failures (no data) and comm loss (stale > 10 minutes)
      const failed = [];
      const latestTimestamps = results.map((profiles) => {
        if (!profiles || profiles.length === 0) return null;
        let maxTs = null;
        for (const p of profiles) {
          if (!p || !p.time) continue;
          const t = new Date(p.time).getTime();
          if (!maxTs || t > maxTs) maxTs = t;
        }
        return maxTs;
      });

      results.forEach((profiles, idx) => {
        if (!profiles || profiles.length === 0) failed.push(idx + 1);
      });

      const valid = latestTimestamps.filter((t) => !!t);
      const maxLatest = valid.length ? Math.max(...valid) : null;
      const lost = [];
      if (maxLatest) {
        for (let i = 0; i < latestTimestamps.length; i++) {
          const t = latestTimestamps[i];
          if (!t) {
            lost.push(i + 1);
            continue;
          }
          const deltaMin = (maxLatest - t) / 60000;
          if (deltaMin > 10) lost.push(i + 1);
        }
      }

      setFailedMegas(failed);
      setLostMegas(lost);
    } catch (err) {
      console.error(err);
      setError('Error al obtener datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fecha por defecto segun el servidor (Server/date), no la del navegador
    let alive = true;
    getToday()
      .then((serverToday) => {
        if (alive && serverToday) setDate(serverToday);
      })
      .catch(() => {
        // sin Server/date: se conserva la fecha local
      });
    return () => {
      alive = false;
    };
  }, []);

  const maxRows = useMemo(() => {
    if (!allData || allData.length === 0) return 0;
    return Math.max(...allData.map((d) => (d ? d.length : 0)));
  }, [allData]);

  const tableRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < maxRows; i++) {
      let timeValue = 'NA';
      for (const data of allData) {
        if (data && data[i] && data[i].time) {
          timeValue = data[i].time;
          break;
        }
      }
      const row = [timeValue];
      for (let m = 0; m < NUM_MEGAS; m++) {
        const data = allData[m];
        if (data && data[i] && data[i].channels !== undefined) {
          const ch = data[i].channels;
          row.push(formatCell(Array.isArray(ch) ? ch[0] : ch));
        } else {
          row.push('NA');
        }
      }
      rows.push(row);
    }
    return rows;
  }, [allData, maxRows]);

  const handleDownloadCsv = () => {
    const headers = ['Hora', ...Array.from({ length: NUM_MEGAS }, (_, i) => `Mega ${i + 1}`)];
    const csvRows = [headers.join(',')];
    tableRows.forEach((r) => {
      const escaped = r.map((c) => {
        if (c === null || c === undefined) return '';
        const s = String(c);
        if (s.includes(',') || s.includes('\n') || s.includes('"')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      });
      csvRows.push(escaped.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `reporte_21megas_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify('CSV exportado correctamente', 'success');
  };
//commentario de prueba
  return (
    <>
      <Helmet>
        <title>Reporte 21 Megas | IUSASOL</title>
      </Helmet>
      <Box sx={{ flexGrow: 1, py: 8 }}>
        <Container maxWidth="xl">
          <Stack spacing={3}>
            <Stack alignItems="flex-start" direction="row" justifyContent="space-between" spacing={3}>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                Reporte de Generación - 21 Megas
              </Typography>
            </Stack>

            <Card sx={{ p: 4, boxShadow: 3 }}>
              <Stack direction="row" spacing={2} alignItems="center" mb={3}>
                <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                  Fecha:
                </Typography>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{ fontSize: '1rem', padding: '6px 12px', borderRadius: 4, border: '1px solid #ccc' }}
                />
                <Button variant="contained" color="primary" onClick={handleLoad} disabled={loading}>
                  {loading ? <CircularProgress size={20} /> : 'Consultar'}
                </Button>
                <Button variant="outlined" color="secondary" onClick={handleDownloadCsv} disabled={tableRows.length === 0}>
                  Descargar CSV
                </Button>
              </Stack>

              {failedMegas.length > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>Los siguientes megas no tienen datos: {failedMegas.join(', ')}</Alert>
              )}

              {lostMegas.length > 0 && (
                <Alert severity="error" sx={{ mt: 2 }}>Pérdida de comunicación, ¡Alerta! Megas: {lostMegas.join(', ')}</Alert>
              )}

              {error && <Typography color="error">{error}</Typography>}

              <Box sx={{ overflowX: 'auto', mt: 2 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f5f5f5' }}>
                    <tr>
                      <th style={{ padding: 8, fontWeight: 700, borderBottom: '1px solid #e0e0e0' }}>Hora</th>
                      {Array.from({ length: NUM_MEGAS }, (_, i) => (
                        <th key={i} style={{ padding: 8, fontWeight: 700, borderBottom: '1px solid #e0e0e0' }}>
                          Mega {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.length === 0 && (
                      <tr>
                        <td colSpan={NUM_MEGAS + 1} style={{ padding: 16, textAlign: 'center' }}>
                          Sin datos. Presiona "Consultar" para cargar.
                        </td>
                      </tr>
                    )}
                    {tableRows.map((r, idx) => (
                      <tr key={idx}>
                        {r.map((c, ci) => (
                          <td key={ci} style={{ padding: 6, borderBottom: '1px solid #f0f0f0' }}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            </Card>
          </Stack>
        </Container>
      </Box>
    </>
  );
};

export default Tabla;
