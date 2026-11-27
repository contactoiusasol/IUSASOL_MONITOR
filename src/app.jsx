import { useRoutes } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { routes } from './routes';
import { createTheme } from './theme';
import { AuthProvider, useAuth } from './contexts/auth-context';
import { NotifyProvider } from './components/notify';
import { LoadingScreen } from './components/loading-screen';
import 'simplebar-react/dist/simplebar.min.css';

const AppContent = () => {
  const { isLoading } = useAuth();
  const element = useRoutes(routes);
  const theme = createTheme({
    colorPreset: 'green',
    contrast: 'high'
  });

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NotifyProvider>
        {element}
      </NotifyProvider>
    </ThemeProvider>
  );
};

export const App = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);
