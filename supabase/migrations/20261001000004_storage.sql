-- =====================================================================
-- Storage: fotos de lugares
-- ---------------------------------------------------------------------
-- Bucket público de solo lectura (las fotos de lugares no son datos
-- sensibles y así los invitados las ven sin firmar URLs).
-- Ruta obligatoria: {trip_id}/{nombre-archivo}
-- Solo los admins de ese viaje pueden subir, reemplazar o borrar.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'place-photos',
  'place-photos',
  true,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Convierte el primer segmento de la ruta a uuid de forma segura
create or replace function public.storage_trip_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_first text := split_part(p_name, '/', 1);
begin
  if v_first ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_first::uuid;
  end if;
  return null;
end;
$$;

create policy place_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'place-photos'
    and public.is_trip_admin(public.storage_trip_id(name))
  );

create policy place_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'place-photos'
    and public.is_trip_admin(public.storage_trip_id(name))
  )
  with check (
    bucket_id = 'place-photos'
    and public.is_trip_admin(public.storage_trip_id(name))
  );

create policy place_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'place-photos'
    and public.is_trip_admin(public.storage_trip_id(name))
  );

-- Necesario para que el cliente pueda listar/sobrescribir sus propios
-- archivos (la lectura pública de las imágenes no pasa por esta policy)
create policy place_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'place-photos'
    and public.is_trip_admin(public.storage_trip_id(name))
  );
