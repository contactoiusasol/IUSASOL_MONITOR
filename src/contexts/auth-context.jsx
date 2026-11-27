import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from 'src/lib/supabase';
import { obtenerRol } from 'src/lib/roles';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'admin' | 'usuario' | null
  const [isRoleLoading, setIsRoleLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Verificar sesión al cargar
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('Session error:', sessionError);
          throw sessionError;
        }
        if (mounted) {
          const siguiente = session?.user ?? null;
          setUser((prev) => (prev && prev.id === (siguiente?.id ?? null) ? prev : siguiente));
        }
      } catch (err) {
        console.error('Auth error:', err);
        if (mounted) {
          setError(err?.message || 'Error de autenticación');
          setUser(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    checkSession();

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        const siguiente = session?.user ?? null;
        setUser((prev) => (prev && prev.id === (siguiente?.id ?? null) ? prev : siguiente));
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Cargar el rol (admin/usuario) cada vez que cambia la sesion
  useEffect(() => {
    let mounted = true;

    if (!user?.id) {
      setRole(null);
      setIsRoleLoading(false);
      return () => {
        mounted = false;
      };
    }

    setIsRoleLoading(true);
    obtenerRol(user.id)
      .then((r) => {
        if (mounted) setRole(r);
      })
      .finally(() => {
        if (mounted) setIsRoleLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const login = async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (loginError) throw loginError;
      setUser(data.user);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signupError) throw signupError;
      return { success: true, data };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { error: logoutError } = await supabase.auth.signOut();
      if (logoutError) throw logoutError;
      setUser(null);
      setRole(null);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isRoleLoading,
        isLoading,
        error,
        login,
        signup,
        logout,
        isAuthenticated: !!user,
        isAdmin: role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de AuthProvider');
  }
  return context;
};
