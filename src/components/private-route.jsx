import { Navigate } from 'react-router-dom';
import { useAuth } from 'src/contexts/auth-context';
import { AuthLoading } from './auth-loading';

export const PrivateRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <AuthLoading />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};
