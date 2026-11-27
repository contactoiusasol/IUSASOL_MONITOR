import { useState, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Box, Container, Stack, Typography, Card, TextField, Button } from '@mui/material';
import listadoSFV from 'src/lib/listadoSFV';
import { useNotify } from 'src/components/notify';

const ListadoSFV = () => {
  const notify = useNotify();
  const [fecha, setFecha] = useState('');
  // The Excel file is read from the server via /api/datos.php (requires session)
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(null);
  const activeRef = useRef(false);

  async function handleConsultar() {
    if (!fecha) {
      notify('Selecciona una fecha antes de consultar', 'warning');
      return;
    }

    const formatted = fecha.replace(/-/g, '/');
    setRows([]);
    setProcessed(0);
    setTotal(null);
    setLoading(true);
    setError(null);
    activeRef.current = true;
    try {
      // get total rows from the Excel first to show progress
      const datosRef = await listadoSFV.leerExcel();
      setTotal(datosRef.length);

      for await (const row of listadoSFV.obtenerDatosStream(formatted)) {
        if (!activeRef.current) break;
        setRows((prev) => [...prev, row]);
        setProcessed((p) => p + 1);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Error al consultar datos');
    } finally {
      setLoading(false);
      activeRef.current = false;
    }
  }

  // no file input; reads datos/listadoSFV.xlsx from the server by default

  function exportCSV() {
    if (!rows.length) return;
    const header = ['serial', 'idcode', 'usuario', 'noDeModulos', 'genera', 'resultado', 'tipoSistema', 'tipoLectura'];
    const lines = [header.join(',')];
    for (const r of rows) {
      const line = [r.serial, r.idcode, r.usuario, r.noDeModulos, r.genera?.toFixed?.(2) ?? r.genera, r.resultado?.toFixed?.(2) ?? r.resultado, r.tipoSistema, r.tipoLectura]
        .map((c) => `"${String(c ?? '')}"`)
        .join(',');
      lines.push(line);
    }
    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `listadoSFV_${fecha || 'export'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Helmet>
        <title>Listado SFV | IUSASOL</title>
      </Helmet>
      <Box sx={{ flexGrow: 1, py: 8 }}>
        <Container maxWidth="xl">
          <Stack spacing={3}>
            <Stack alignItems="flex-start" direction="row" justifyContent="space-between" spacing={3}>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                Listado SFV
              </Typography>
            </Stack>

            <Card sx={{ p: 4, boxShadow: 3 }}>
              <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                <TextField
                  label="Fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                />

                <Button variant="contained" onClick={handleConsultar} disabled={loading}>
                  {loading ? 'Consultando...' : 'Consultar'}
                </Button>

                {loading && (
                  <Button variant="text" color="inherit" onClick={() => { activeRef.current = false; setLoading(false); }}>
                    Cancelar
                  </Button>
                )}

                <Button variant="outlined" onClick={() => { exportCSV(); notify('CSV exportado correctamente', 'success'); }} disabled={rows.length === 0}>
                  Exportar CSV
                </Button>
              </Stack>

              {error && <Typography color="error">{error}</Typography>}

              {loading && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Procesando {processed}{total ? ` / ${total}` : ''} ...
                </Typography>
              )}

              <Box sx={{ overflowX: 'auto', mt: 2 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f5f5f5' }}>
                    <tr>
                      <th style={{ padding: 8, fontWeight: 700 }}>Serial</th>
                      <th style={{ padding: 8, fontWeight: 700 }}>Idcode</th>
                      <th style={{ padding: 8, fontWeight: 700 }}>Usuario</th>
                      <th style={{ padding: 8, fontWeight: 700 }}>No. Módulos</th>
                      <th style={{ padding: 8, fontWeight: 700 }}>Genera</th>
                      <th style={{ padding: 8, fontWeight: 700 }}>Resultado</th>
                      <th style={{ padding: 8, fontWeight: 700 }}>Tipo Sistema</th>
                      <th style={{ padding: 8, fontWeight: 700 }}>Tipo Lectura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 16, textAlign: 'center' }}>
                          {loading ? 'Consultando...' : 'No hay datos.'}
                        </td>
                      </tr>
                    ) : (
                      rows.map((r, i) => (
                        <tr key={i} style={{ background: r.color }}>
                          <td style={{ padding: 6, borderBottom: '1px solid #f0f0f0' }}>{r.serial}</td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f0f0f0' }}>{r.idcode}</td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f0f0f0' }}>{r.usuario}</td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f0f0f0' }}>{r.noDeModulos}</td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f0f0f0' }}>{r.genera?.toFixed?.(2)}</td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f0f0f0' }}>{r.resultado?.toFixed?.(2)}</td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f0f0f0' }}>{r.tipoSistema}</td>
                          <td style={{ padding: 6, borderBottom: '1px solid #f0f0f0' }}>{r.tipoLectura}</td>
                        </tr>
                      ))
                    )}
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

export default ListadoSFV;
