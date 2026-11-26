import { Box, CircularProgress, Container, Typography } from '@mui/material';

/** Pantalla de carga que usan PrivateRoute y RoleRoute. */
export const AuthLoading = ({ message = 'Verificando autenticación...' }) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      gap: 2
    }}
  >
    <CircularProgress size={50} />
    <Typography variant="body1" color="textSecondary">
      {message}
    </Typography>
  </Box>
);
