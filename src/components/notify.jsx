import { createContext, useCallback, useContext, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';

const NotifyContext = createContext(() => {});

/**
 * Avisos flotantes (snackbar) para toda la app.
 *
 * Uso: const notify = useNotify();
 *      notify('CSV exportado', 'success');
 *      notify('No se pudo cargar', 'error');
 */
export const NotifyProvider = ({ children }) => {
  const [estado, setEstado] = useState({ open: false, message: '', severity: 'info' });

  const notify = useCallback((message, severity = 'info') => {
    setEstado({ open: true, message: String(message ?? ''), severity });
  }, []);

  const cerrar = useCallback((_event, reason) => {
    if (reason === 'clickaway') return;
    setEstado((prev) => ({ ...prev, open: false }));
  }, []);

  return (
    <NotifyContext.Provider value={notify}>
      {children}
      <Snackbar
        open={estado.open}
        autoHideDuration={6000}
        onClose={cerrar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={cerrar} severity={estado.severity} variant="filled" sx={{ width: '100%' }}>
          {estado.message}
        </Alert>
      </Snackbar>
    </NotifyContext.Provider>
  );
};

export const useNotify = () => useContext(NotifyContext);
