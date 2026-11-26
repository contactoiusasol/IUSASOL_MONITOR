import { Navigate } from 'react-router-dom';
import { useAuth } from 'src/contexts/auth-context';
import { AuthLoading } from './auth-loading';

/**
 * Protege una ruta que requiere rol de administrador
 * (por ejemplo /listadoSFV).
 *
 * Mientras carga la sesión o el rol muestra carga; si no es admin,
 * regresa al dashboard. Se usa POR DENTRO de PrivateRoute.
 */
export const RoleRoute = ({ children }) => {
  const { isAuthenticated, isAdmin, isLoading, isRoleLoading } = useAuth();

  if (isLoading || isRoleLoading) {
    return <AuthLoading message="Verificando permisos..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
};
