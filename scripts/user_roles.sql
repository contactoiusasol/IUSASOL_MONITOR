-- ============================================================================
-- Roles (administrador / usuario) para Monitoreo IUSASOL
--
-- DONDE PEGARLO: Supabase -> SQL Editor -> New query -> pegar -> Run.
-- UNA SOLA VEZ.
--
-- Regla: un usuario SIN fila en user_roles es "usuario" (rol por defecto).
-- Solo el dueño del proyecto (usted) puede escribir en esta tabla: no hay
-- policies de INSERT/UPDATE/DELETE para el navegador, asi que NINGUN usuario
-- puede auto-elevarse a administrador.
-- ============================================================================

create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'usuario'
             constraint user_roles_role_chk check (role in ('admin', 'usuario')),
  updated_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

drop policy if exists "usuario lee su propio rol" on public.user_roles;
create policy "usuario lee su propio rol"
  on public.user_roles
  for select
  to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- ASIGNAR ADMINISTRADOR (reemplaza el UUID por el del usuario).
-- Lo encuentras en: Authentication -> Users -> clic en el usuario -> copy ID.
-- ----------------------------------------------------------------------------
-- insert into public.user_roles (user_id, role)
-- values ('00000000-0000-0000-0000-000000000000', 'admin')
-- on conflict (user_id) do update set role = 'admin', updated_at = now();

-- ----------------------------------------------------------------------------
-- QUITAR administrador:
-- ----------------------------------------------------------------------------
-- update public.user_roles set role = 'usuario', updated_at = now()
-- where user_id = '00000000-0000-0000-0000-000000000000';

-- ----------------------------------------------------------------------------
-- VER quién es quién:
-- ----------------------------------------------------------------------------
-- select u.email, coalesce(r.role, 'usuario (sin fila)') as rol
-- from auth.users u
-- left join public.user_roles r on r.user_id = u.id
-- order by u.created_at;
