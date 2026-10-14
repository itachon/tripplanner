-- ---------------------------------------------------------------------
-- Categorías de lugares: icono, color y nombre en español.
-- place_categories: lo que se ve y (a futuro) se filtra.
-- place_category_tags: qué etiqueta guardada en catalog_places.category
-- pertenece a cada categoría. Solo se modifican con migraciones.
-- ---------------------------------------------------------------------
create table public.place_categories (
  key        text primary key,
  icon       text not null,
  color      text not null check (color ~ '^#[0-9a-f]{6}$'),
  sort_order int  not null,
  label_es   text not null
);

create table public.place_category_tags (
  tag          text primary key check (tag = lower(trim(tag)) and tag <> ''),
  category_key text not null references public.place_categories(key) on update cascade on delete cascade
);

alter table public.place_categories enable row level security;
alter table public.place_category_tags enable row level security;

revoke all on public.place_categories, public.place_category_tags from anon, authenticated;
grant select on public.place_categories, public.place_category_tags to anon, authenticated;

create policy place_categories_select on public.place_categories for select to anon, authenticated using (true);
create policy place_category_tags_select on public.place_category_tags for select to anon, authenticated using (true);

insert into public.place_categories (key, icon, color, sort_order, label_es) values
  ('museum',     'i-lucide-landmark',      '#7c3aed', 1,  'Museos'),
  ('monument',   'i-lucide-castle',        '#b45309', 2,  'Monumentos'),
  ('worship',    'i-lucide-church',        '#be185d', 3,  'Templos'),
  ('culture',    'i-lucide-theater',       '#c026d3', 4,  'Arte y entretenimiento'),
  ('park',       'i-lucide-trees',         '#16a34a', 5,  'Parques'),
  ('viewpoint',  'i-lucide-mountain',      '#0891b2', 6,  'Miradores'),
  ('lodging',    'i-lucide-bed-double',    '#2563eb', 7,  'Hoteles'),
  ('restaurant', 'i-lucide-utensils',      '#ea580c', 8,  'Restaurantes'),
  ('cafe',       'i-lucide-coffee',        '#92400e', 9,  'Cafés'),
  ('bar',        'i-lucide-wine',          '#9f1239', 10, 'Bares'),
  ('shop',       'i-lucide-shopping-bag',  '#0d9488', 11, 'Tiendas'),
  ('transport',  'i-lucide-train-front',   '#475569', 12, 'Transporte'),
  ('other',      'i-lucide-map-pin',       '#78716c', 99, 'Otros');

-- Cada categoría es también una etiqueta de sí misma
insert into public.place_category_tags (tag, category_key)
select key, key from public.place_categories;

insert into public.place_category_tags (tag, category_key) values
  ('museo', 'museum'), ('art_gallery', 'museum'), ('gallery', 'museum'), ('galería de arte', 'museum'),
  ('landmark', 'monument'), ('historic', 'monument'), ('historic_site', 'monument'), ('memorial', 'monument'),
  ('castle', 'monument'), ('palace', 'monument'), ('palacio', 'monument'), ('monumento', 'monument'),
  ('castillo', 'monument'), ('sitio histórico', 'monument'),
  ('place_of_worship', 'worship'), ('religion', 'worship'), ('religious', 'worship'), ('temple', 'worship'),
  ('church', 'worship'), ('shrine', 'worship'), ('mosque', 'worship'), ('templo', 'worship'),
  ('iglesia', 'worship'), ('santuario', 'worship'),
  ('arts_and_entertainment', 'culture'), ('attraction', 'culture'), ('entertainment', 'culture'),
  ('theatre', 'culture'), ('theater', 'culture'), ('cinema', 'culture'), ('music', 'culture'),
  ('stadium', 'culture'), ('zoo', 'culture'), ('aquarium', 'culture'), ('theme_park', 'culture'),
  ('teatro', 'culture'), ('cine', 'culture'), ('atracción turística', 'culture'),
  ('park_like', 'park'), ('garden', 'park'), ('national_park', 'park'), ('nature_reserve', 'park'),
  ('parque', 'park'), ('jardín', 'park'),
  ('mirador', 'viewpoint'), ('natural_feature', 'viewpoint'), ('mountain', 'viewpoint'),
  ('beach', 'viewpoint'), ('playa', 'viewpoint'),
  ('hotel', 'lodging'), ('hostel', 'lodging'), ('motel', 'lodging'), ('accommodation', 'lodging'),
  ('alojamiento', 'lodging'), ('hostal', 'lodging'),
  ('food_and_drink', 'restaurant'), ('food', 'restaurant'), ('fast_food', 'restaurant'),
  ('restaurante', 'restaurant'), ('comida', 'restaurant'),
  ('coffee', 'cafe'), ('coffee_shop', 'cafe'), ('bakery', 'cafe'), ('café', 'cafe'),
  ('cafetería', 'cafe'), ('panadería', 'cafe'),
  ('pub', 'bar'), ('nightclub', 'bar'), ('alcohol', 'bar'), ('beer', 'bar'), ('biergarten', 'bar'),
  ('shopping', 'shop'), ('store', 'shop'), ('mall', 'shop'), ('grocery', 'shop'),
  ('commercial_services', 'shop'), ('market', 'shop'), ('tienda', 'shop'), ('mercado', 'shop'),
  ('centro comercial', 'shop'),
  ('airport', 'transport'), ('rail', 'transport'), ('rail_station', 'transport'),
  ('train_station', 'transport'), ('bus', 'transport'), ('bus_station', 'transport'),
  ('transit', 'transport'), ('ferry', 'transport'), ('aeropuerto', 'transport'), ('estación', 'transport');
