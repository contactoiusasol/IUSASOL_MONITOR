import { Helmet } from 'react-helmet-async';
import { Box, Container, Stack, Typography, Card } from '@mui/material';

const ErrorPage = () => {
  return (
    <>
      <Helmet>
        <title>Error: No Encontrado | IUSASOL</title>
      </Helmet>
      <Box sx={{ flexGrow: 1, py: 8 }}>
        <Container maxWidth="xl">
          <Stack spacing={3}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>Error - Página no encontrada</Typography>

            <Card sx={{ p: 3, boxShadow: 3 }}>
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <Typography variant="h2" sx={{ fontWeight: 700, mb: 2 }}>404</Typography>
                <Typography variant="h5" sx={{ mb: 2 }}>¡La página solicitada no existe!</Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                  La página que intentas acceder no se encuentra disponible. Por favor, verifica la URL o regresa al inicio.
                </Typography>
              </Box>
            </Card>
          </Stack>
        </Container>
      </Box>
    </>
  );
};

export default ErrorPage;
