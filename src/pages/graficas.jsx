import { Helmet } from 'react-helmet-async';
import { Box, Container, Typography, CircularProgress, TextField, Alert, Button, Stack } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { getDataForAllMegas } from 'src/lib/grafica21megas';
import { getToday } from 'src/lib/api/endpoints';
import { useNotify } from 'src/components/notify';

Chart.register(...registerables);

const GraficasPage = () => {
  const notify = useNotify();
  const lineCanvasRef = useRef(null);
  const lineChartRef = useRef(null);
  const barCanvasRef = useRef(null);
  const barChartRef = useRef(null);
  const hbarCanvasRef = useRef(null);
  const hbarChartRef = useRef(null);
  const pieCanvasRef = useRef(null);
  const pieChartRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [lostMegas, setLostMegas] = useState([]);
  const selectedDateRef = useRef(selectedDate);
  const mountedRef = useRef(true);

  // "Hoy" segun el SERVIDOR (Server/date): evita depender de la zona horaria
  // del navegador. Arranca con la fecha local y se corrige sola al llegar.
  const [todayServer, setTodayServer] = useState(selectedDate);
  const todayRef = useRef(todayServer);
  todayRef.current = todayServer;
  const userPickedRef = useRef(false);

  // Today's date string in local time (YYYY-MM-DD)
  const todayString = todayServer;

  // Centralized loader that can be called from effects and handlers
  const load = async (dateToFetch) => {
    setLoading(true);
    setError(null);
    try {
      const allData = await getDataForAllMegas(dateToFetch);

      if (!mountedRef.current) return;

      if (!allData || allData.length === 0) {
        setError(`No hay datos para la fecha seleccionada (${dateToFetch}). Puede que la API aún no publique información para ese día.`);
        setLoading(false);
        setLostMegas([]);
        // destroy any existing charts
        if (lineChartRef.current) lineChartRef.current.destroy();
        if (barChartRef.current) barChartRef.current.destroy();
        if (hbarChartRef.current) hbarChartRef.current.destroy();
        if (pieChartRef.current) pieChartRef.current.destroy();
        return;
      }

      // Determine latest timestamp per mega to detect stale data
      const latestTimestamps = allData.map((profiles) => {
        if (!profiles || profiles.length === 0) return null;
        // Find the max time in the profiles array
        let maxTs = null;
        for (const p of profiles) {
          if (!p || !p.time) continue;
          const t = new Date(p.time).getTime();
          if (!maxTs || t > maxTs) maxTs = t;
        }
        return maxTs;
      });

      const validTimestamps = latestTimestamps.filter((t) => !!t);
      const maxLatest = validTimestamps.length ? Math.max(...validTimestamps) : null;

      // If maxLatest exists, compute loss of communication (10 minutes threshold)
      const lost = [];
      if (maxLatest) {
        for (let i = 0; i < latestTimestamps.length; i++) {
          const t = latestTimestamps[i];
          if (!t) {
            lost.push(i + 1);
            continue;
          }
          const deltaMin = (maxLatest - t) / 60000;
          if (deltaMin > 10) {
            lost.push(i + 1);
          }
        }
      }

        // persist lost list to state for UI
        setLostMegas(lost);

      const labels = (allData[0] || []).map((p) => p.time);
      const datasets = allData.map((data, idx) => ({
        label: `Mega${idx + 1}`,
        data: (data || []).map((p) => parseFloat(p.channels && p.channels[0]) || 0),
        borderColor: lost.includes(idx + 1) ? 'red' : (idx === 20 ? 'black' : `hsl(${idx * 18}, 100%, 45%)`),
        fill: false,
        tension: 0.1
      }));

      // Line chart (time series)
      const lineCtx = lineCanvasRef.current.getContext('2d');
      if (lineChartRef.current) lineChartRef.current.destroy();
      lineChartRef.current = new Chart(lineCtx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: { x: { title: { display: true, text: 'Horas' } }, y: { title: { display: true, text: 'kWh' } } }
        }
      });

      // Aggregated sums per mega for bar / pie charts
      const megaLabels = datasets.map((_, i) => `Mega ${i + 1}`);
      const megaSums = datasets.map((ds) => ds.data.reduce((s, v) => s + (parseFloat(v) || 0), 0));

      const colors = megaLabels.map((_, i) => `hsl(${i * 18},100%,45%)`);

      // Vertical bar chart (acumulado) - use uniform blue color
      const barCtx = barCanvasRef.current.getContext('2d');
      if (barChartRef.current) barChartRef.current.destroy();
      const blue = 'hsl(198,100%,45%)';
      barChartRef.current = new Chart(barCtx, {
        type: 'bar',
        data: { labels: megaLabels, datasets: [{ label: 'Acumulado (kWh)', data: megaSums, backgroundColor: megaLabels.map(() => blue) }] },
        options: { responsive: true, maintainAspectRatio: false }
      });

      // Horizontal bar chart - uniform blue
      const hbarCtx = hbarCanvasRef.current.getContext('2d');
      if (hbarChartRef.current) hbarChartRef.current.destroy();
      hbarChartRef.current = new Chart(hbarCtx, {
        type: 'bar',
        data: { labels: megaLabels, datasets: [{ label: 'Acumulado (kWh)', data: megaSums, backgroundColor: megaLabels.map(() => blue) }] },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
      });

      // Pie chart (acumulado por mega)
      const pieCtx = pieCanvasRef.current.getContext('2d');
      if (pieChartRef.current) pieChartRef.current.destroy();
      pieChartRef.current = new Chart(pieCtx, {
        type: 'pie',
        data: { labels: megaLabels, datasets: [{ data: megaSums, backgroundColor: megaLabels.map(() => blue) }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: function (context) {
                  const value = context.raw ?? 0;
                  const data = context.dataset.data;
                  const total = data.reduce((s, v) => s + (parseFloat(v) || 0), 0);
                  const pct = total > 0 ? ((value / total) * 100).toFixed(2) : '0.00';
                  return `${context.label}: ${value.toFixed(2)} kWh (${pct}%)`;
                }
              }
            }
          }
        }
      });
    } catch (err) {
      console.error(err);
      setError('Error al obtener los datos. Revisa la consola para más detalles.');
      if (lineChartRef.current) lineChartRef.current.destroy();
      if (barChartRef.current) barChartRef.current.destroy();
      if (hbarChartRef.current) hbarChartRef.current.destroy();
      if (pieChartRef.current) pieChartRef.current.destroy();
    } finally {
      setLoading(false);
    }
  };

  // Export chart to PNG
  const exportChartPNG = (chartRefLocal, filename) => {
    if (!chartRefLocal || !chartRefLocal.current) return;
    try {
      const url = chartRefLocal.current.toBase64Image();
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      notify('Gráfica exportada correctamente', 'success');
    } catch (e) {
      console.error('Error exporting chart:', e);
      notify('Error al exportar la gráfica', 'error');
    }
  };

  // The main effect below handles initial load and periodic refresh; the duplicated
  // effect here was removed to avoid referencing old variables (canvasRef/chartRef)

  // When user changes selectedDate via UI, fetch immediately
  useEffect(() => {
    selectedDateRef.current = selectedDate;
    load(selectedDate);
  }, [selectedDate]);

  // Corrige "hoy" con la fecha del servidor apenas disponible (Server/date)
  useEffect(() => {
    let alive = true;
    getToday()
      .then((serverToday) => {
        if (!alive || !serverToday) return;
        setTodayServer(serverToday);
        todayRef.current = serverToday;
        if (!userPickedRef.current && serverToday !== selectedDateRef.current) {
          selectedDateRef.current = serverToday;
          setSelectedDate(serverToday); // recarga via el efecto de selectedDate
        }
      })
      .catch(() => {
        // sin conexion al Server/date: se conserva la fecha local
      });
    return () => {
      alive = false;
    };
  }, []);

  // Auto refresh every 5 minutes. If user is viewing a past date, after the interval
  // we switch back to today's date and reload.
  useEffect(() => {
    const interval = setInterval(() => {
      const today = todayRef.current;
      if (selectedDateRef.current !== today) {
        selectedDateRef.current = today;
        setSelectedDate(today);
        load(today);
      } else {
        load(today);
      }
    }, 1000 * 60 * 5);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Helmet>
        <title>Graficas | IUSASOL</title>
      </Helmet>
      <Box sx={{ flexGrow: 1, py: 8 }}>
        <Container maxWidth="xl">
          <Typography variant="h4" sx={{ mb: 2 }}>Gráficas 21 Megas</Typography>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
            <TextField
              label="Fecha"
              type="date"
              value={selectedDate}
              onChange={(e) => {
                userPickedRef.current = true;
                setSelectedDate(e.target.value);
              }}
              InputLabelProps={{ shrink: true }}
              size="small"
            />

            <Button variant="contained" size="small" onClick={() => load(selectedDate)}>
              Actualizar ahora
            </Button>

            {selectedDate !== todayString && (
              <Alert severity="info">Estás viendo datos de una fecha pasada; la vista volverá a la fecha actual en la próxima actualización automática (cada 5 minutos).</Alert>
            )}
          </Box>

          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
              <CircularProgress />
            </Box>
          )}
          {error && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="error">{error}</Alert>
            </Box>
          )}

          {lostMegas.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="error">Pérdida de comunicación, ¡Alerta! Megas: {lostMegas.join(', ')}</Alert>
            </Box>
          )}

          <Box>
            <Typography variant="h6" sx={{ mb: 1 }}>21 MEGAS</Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1, height: 420 }}>
                <canvas id="lineChart" ref={lineCanvasRef} style={{ width: '100%', height: '100%' }} />
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, mt: 3, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 420px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="h6" sx={{ mb: 1, flex: 1 }}>Bar Chart (vertical) - Acumulado por Mega</Typography>
                  <Button variant="outlined" size="small" onClick={() => exportChartPNG(barChartRef, `bar-vertical-${selectedDate}.png`)}>Exportar PNG</Button>
                </Box>
                <Box sx={{ height: 300 }}>
                  <canvas id="barChart" ref={barCanvasRef} style={{ width: '100%', height: '100%' }} />
                </Box>
              </Box>

              <Box sx={{ flex: '1 1 420px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="h6" sx={{ mb: 1, flex: 1 }}>Bar Chart (horizontal) - Acumulado por Mega</Typography>
                  <Button variant="outlined" size="small" onClick={() => exportChartPNG(hbarChartRef, `bar-horizontal-${selectedDate}.png`)}>Exportar PNG</Button>
                </Box>
                <Box sx={{ height: 300 }}>
                  <canvas id="hbarChart" ref={hbarCanvasRef} style={{ width: '100%', height: '100%' }} />
                </Box>
              </Box>
            </Box>

            <Box sx={{ mt: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6" sx={{ mb: 1, flex: 1 }}>Pie Chart - Distribución por Mega</Typography>
                <Button variant="outlined" size="small" onClick={() => exportChartPNG(pieChartRef, `pie-distribucion-${selectedDate}.png`)}>Exportar PNG</Button>
              </Box>
              <Box sx={{ height: 420, mt: 1 }}>
                <canvas id="pieChart" ref={pieCanvasRef} style={{ width: '100%', height: '100%' }} />
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>
    </>
  );
};

export default GraficasPage;
