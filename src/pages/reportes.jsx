import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Box, Container, Stack, Typography, Card, Grid, TextField, Button, LinearProgress, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { TOKEN } from 'src/config/token';

const configTablas = {
  'tabla-mega-21': [
    '00000000CYM778 VL2E 17NB',
    '00000000CYM780 VL2E 17NB'
  ],
  'tabla-coppel': [
    '00000000CYM448 VL2E 17NB',
    '00000000CS0486 VL2E 19NB',
    '00000000CYM589 KL2E 17NA',
    '00000000CS0485 VL2E 19NB',
    '00000000CYM659 KL2E 17NA',
    '00000000CYM808 VL2E 17NB',
    '00000000CYM600 KL2E 17NA',
    '00000000CS0488 VL2E 19NB',
    '00000000CS1306 VL2E 19NB'
  ],
  'tabla-aifa': [
    '0000000084I87S FD2J 20MX',
    '00000000CYM772 VL2E 17NB'
  ],
  'tabla-aeropuerto-tulum': [
    '00000000CS3379 VL2E 19NB',
    '00000000CS3378 VL2E 19NB',
    '00000000CS3380 VL2E 19NB',
    '00000000CS3566 KL2E 17NA'
  ],
  'tabla-marquez': [
    '00000000CS0433 F62J 19MY',
    '00000000CS0462 F62J 19MY',
    '0000000070I04S FD2J 18MX'
  ]
};

const MARQUEZ_SERIAL_ESPECIAL = '00000000CS0433 F62J 19MY';

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

export default function Reportes() {
  const [fecha, setFecha] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState({}); // tablaId -> { horas: [], datosPorMedidor: { serial: [{hora,genera,recibida,entregada,diferencia}] } }

  async function inicializarMapeo() {
    try {
      const { data } = await axios.get('https://api.iusasol.mx/v2.1/api/Reports/ISOL/Meters', { headers });
      const serialesNecesarios = Object.values(configTablas).flat();
      const map = {};
      (data.meters || []).forEach(m => {
        if (serialesNecesarios.includes(m.serial.trim())) map[m.serial.trim()] = m.idcode;
      });
      return map;
    } catch (err) {
      console.error('Error al inicializar mapeo:', err);
      throw err;
    }
  }

  async function obtenerDatosCincominutales(serial, idmap) {
    if (!fecha) return null;
    const idcode = idmap[serial];
    if (!idcode) return { error: 'No registrado' };

    try {
      const { data } = await axios.get('https://api.iusasol.mx/v2.1/api/Reports/ISOL/Profiles/Detailed', {
        params: { id: idcode, beginDate: fecha, endDate: fecha, tym: '2', tye: 'e', company: 'IUSASOL SUMINISTRADORA ENERGIA' },
        headers,
        timeout: 10000
      });

      if (!data.profiles) return { error: 'Sin datos' };

      return data.profiles.map(p => {
        const v = p.values || {};
        const hora = new Date(p.time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
        const recibida = +(v.charge ?? 0).toFixed(3);
        const entregada = +(v.genera ?? 0).toFixed(3);
        const diferencia = +(v.differ ?? (entregada - recibida)).toFixed(3);
        return { hora, genera: entregada, recibida, entregada, diferencia };
      });
    } catch (err) {
      console.error(`Error en ${serial}:`, err.response?.data || err.message);
      return { error: 'Error API' };
    }
  }

  async function handleBuscar() {
    if (!fecha) return setError('Selecciona una fecha');
    setError(null);
    setLoading(true);
    setResults({});
    try {
      const idmap = await inicializarMapeo();

      const newResults = {};
      for (const [tablaId, serials] of Object.entries(configTablas)) {
        const horasSet = new Set();
        const datosPorMedidor = {};
        let fallidos = 0;

        // initialize progress for this table (UI will show it)
        setResults((prev) => ({ ...prev, [tablaId]: { loading: true, completed: 0, total: serials.length } }));

        let completed = 0;
        for (const serial of serials) {
          const datos = await obtenerDatosCincominutales(serial, idmap);
          completed++;
          // update incremental progress
          setResults((prev) => ({
            ...prev,
            [tablaId]: { ...(prev[tablaId] || {}), loading: true, completed, total: serials.length }
          }));

          if (datos && !datos.error) {
            datos.forEach(d => horasSet.add(d.hora));
            datosPorMedidor[serial] = datos;
          } else {
            fallidos++;
            console.warn(`Fallo ${serial}:`, datos?.error);
          }
        }

        if (Object.keys(datosPorMedidor).length === 0) {
          newResults[tablaId] = { empty: true, fallidos };
        } else {
          newResults[tablaId] = { horas: Array.from(horasSet).sort(), datosPorMedidor };
        }
        // mark done for this table
        setResults((prev) => ({ ...prev, [tablaId]: { ...(newResults[tablaId] || {}), loading: false, completed: serials.length, total: serials.length, fallidos } }));
      }

      setResults(newResults);
    } catch (err) {
      console.error(err);
      setError('Error al procesar datos');
    } finally {
      setLoading(false);
    }
  }

  function handleExportAll() {
    // build workbook
    const workbook = XLSX.utils.book_new();
    const anyData = Object.keys(results).length > 0;
    if (!anyData) return;

    Object.keys(configTablas).forEach((tablaId) => {
      const data = results[tablaId];
      const serials = configTablas[tablaId];

      let aoa = [];
      if (!data || data.empty) {
        aoa = [[`Sin datos${data && data.fallidos ? ` (${data.fallidos} fallidos)` : ''}`]];
      } else if (tablaId === 'tabla-marquez') {
        const header = ['Hora', 'Recibida', 'Entregada', 'Diferencia', ...serials.filter(s => s !== MARQUEZ_SERIAL_ESPECIAL)];
        aoa.push(header);
        (data.horas || []).forEach(hora => {
          const row = [hora];
          ['recibida', 'entregada', 'diferencia'].forEach(campo => {
            const valor = data.datosPorMedidor[MARQUEZ_SERIAL_ESPECIAL]?.find(d => d.hora === hora)?.[campo];
            row.push(valor ?? 'N/A');
          });
          serials.filter(s => s !== MARQUEZ_SERIAL_ESPECIAL).forEach(s => {
            const valor = data.datosPorMedidor[s]?.find(d => d.hora === hora)?.genera;
            row.push(valor ?? 'N/A');
          });
          aoa.push(row);
        });
      } else {
        const header = ['Hora', ...serials];
        aoa.push(header);
        (data.horas || []).forEach(hora => {
          const row = [hora];
          serials.forEach(s => {
            const valor = data.datosPorMedidor[s]?.find(d => d.hora === hora)?.genera;
            row.push(valor ?? 'N/A');
          });
          aoa.push(row);
        });
      }

      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      // sheet name safe: take last part if too long
      const sheetName = tablaId.length > 31 ? tablaId.slice(0, 28) + '...' : tablaId;
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reportes_${fecha || 'export'}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const renderTable = (tablaId) => {
    const data = results[tablaId];
    const serials = configTablas[tablaId];

    if (!data) return null;
    if (data.empty) return <div style={{ padding: 12 }}>Sin datos ({data.fallidos} errores)</div>;

    const horas = data.horas || [];

    if (tablaId === 'tabla-marquez') {
      return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f5f5f5' }}>
            <tr>
              <th style={{ padding: 8, fontWeight: 700 }}>Hora</th>
              <th style={{ padding: 8, fontWeight: 700 }}>Recibida</th>
              <th style={{ padding: 8, fontWeight: 700 }}>Entregada</th>
              <th style={{ padding: 8, fontWeight: 700 }}>Diferencia</th>
              {serials.filter(s => s !== MARQUEZ_SERIAL_ESPECIAL).map(s => (
                <th key={s} style={{ padding: 8, fontWeight: 700 }}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {horas.map(hora => (
              <tr key={hora}>
                <td style={{ padding: 6 }}>{hora}</td>
                {['recibida','entregada','diferencia'].map(campo => {
                  const valor = data.datosPorMedidor[MARQUEZ_SERIAL_ESPECIAL]?.find(d => d.hora === hora)?.[campo];
                  return (<td key={campo} style={{ padding: 6 }}>{valor ?? 'N/A'}</td>);
                })}
                {serials.filter(s => s !== MARQUEZ_SERIAL_ESPECIAL).map(s => {
                  const valor = data.datosPorMedidor[s]?.find(d => d.hora === hora)?.genera;
                  return (<td key={s} style={{ padding: 6 }}>{valor ?? 'N/A'}</td>);
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    // Generic render
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: '#f5f5f5' }}>
          <tr>
            <th style={{ padding: 8, fontWeight: 700 }}>Hora</th>
            {serials.map(s => (<th key={s} style={{ padding: 8, fontWeight: 700 }}>{s}</th>))}
          </tr>
        </thead>
        <tbody>
          {horas.map(hora => (
            <tr key={hora}>
              <td style={{ padding: 6 }}>{hora}</td>
              {serials.map(s => {
                const valor = data.datosPorMedidor[s]?.find(d => d.hora === hora)?.genera;
                return (<td key={s} style={{ padding: 6 }}>{valor ?? 'N/A'}</td>);
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <>
      <Helmet><title>Reportes | IUSASOL</title></Helmet>
      <Box sx={{ flexGrow: 1, py: 8 }}>
        <Container maxWidth="xl">
          <Stack spacing={3}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>Reportes</Typography>

            <Card sx={{ p: 3, boxShadow: 3 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={4}>
                  <TextField label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
                </Grid>
                <Grid item xs={12} md={8}>
                  <Button variant="contained" color="primary" onClick={handleBuscar} disabled={loading || !fecha}>{loading ? 'Cargando…' : 'Buscar'}</Button>
                  <Button sx={{ ml: 2 }} variant="outlined" onClick={() => handleExportAll()} disabled={loading || Object.keys(results).length === 0}>Exportar Excel</Button>
                </Grid>
              </Grid>
            </Card>

            {error && <Typography color="error">{error}</Typography>}

            {Object.keys(configTablas).map((tablaId) => (
              <Accordion key={tablaId} defaultExpanded={false}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <Typography variant="h6">{tablaId}</Typography>
                    {results[tablaId]?.loading && (
                      <Box sx={{ width: 200, ml: 2 }}>
                        <LinearProgress variant={results[tablaId].total ? 'determinate' : 'indeterminate'} value={results[tablaId].total ? (results[tablaId].completed / results[tablaId].total) * 100 : undefined} />
                      </Box>
                    )}
                    {results[tablaId] && results[tablaId].fallidos > 0 && (
                      <Typography variant="caption" color="warning.main">{`Fallidos: ${results[tablaId].fallidos}`}</Typography>
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ overflowX: 'auto' }}>
                    {results[tablaId] ? renderTable(tablaId) : <Typography variant="body2">Sin datos</Typography>}
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </Container>
      </Box>
    </>
  );
}
