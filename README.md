# Viajes en grupo

Planificador de viajes: el organizador arma el viaje, invita a los viajeros con un link o QR único, agrega lugares en un mapa de Mapbox con historia, horarios y foto buscados automáticamente (sin IA), los viajeros votan por los lugares que quieren conocer y el organizador publica el itinerario día a día.

**Stack:** Nuxt 4 · Vue 3 · Nuxt UI 4 · Supabase · Mapbox GL JS v3

## Qué hace

**Organizador** (`/admin`, con cuenta)
- Viajes con destino, fechas, **zona horaria del destino** y fecha límite para confirmar y votar
- **Lugares**: búsqueda con Mapbox ("Gyeongbokgung", "Torre Eiffel") o tocando un punto de interés en el mapa. Cada lugar queda guardado con sus coordenadas
- **Info automática, sin IA**: al agregar un lugar se busca su historia, horarios, web, teléfono y una foto real en OpenStreetMap, Wikidata, Wikipedia y Wikimedia Commons (en ese orden, con Pexels como respaldo opcional). Si ninguna fuente tiene el lugar, queda vacío — nunca se muestra información de otro lugar
- Al **pasar el mouse** sobre un punto del mapa aparece su ficha; en celular, al tocarlo
- Lugares "en votación" o no (hoteles, aeropuertos…), foto opcional, orden propio
- Ver **quién votó** cada lugar y ranking de los más votados
- **Itinerario por días** con horario local, paradas en el mapa o actividades libres (vuelos, tiempo libre), recorrido del día dibujado en el mapa. Se **publica** cuando está listo
- **Viajeros** individuales con link/QR/WhatsApp, invitación masiva, exportar a Excel
- **Co-organizadores** (los asigna solo el creador)

**Viajero** (`/v/:token`, sin cuenta)
- Confirma si va o no (puede cambiar hasta la fecha límite)
- Ve los lugares en el mapa y en tarjetas, con su historia, horarios y foto cuando hay datos
- **Un voto por lugar**, puede votar varios y quitar su voto. Ve cuántos votos lleva cada lugar, nunca quién votó
- Si se retracta, sus votos se borran
- Ve el itinerario cuando se publica, por día, con el recorrido en el mapa

## Puesta en marcha

1. **Supabase**: crea un proyecto y aplica las migraciones de `supabase/migrations/` en orden (`npx supabase db push` o pegándolas en el SQL Editor). En Authentication → URL Configuration agrega `http://localhost:3000/confirm` a Redirect URLs.
2. **Mapbox**: crea un token público en https://account.mapbox.com/access-tokens y restríngelo a tus dominios (por ejemplo `http://localhost:3000` y tu dominio real).
3. Copia `.env.example` a `.env` y completa las claves. `NUXT_PEXELS_API_KEY` es opcional (respaldo de foto genérica).
4. `npm install && npm run dev`

## Notas sobre la info automática de lugares

- Se busca **una vez** al agregar el lugar y queda cacheada en `place_info` (se refresca a los 30 días): los viajeros nunca disparan búsquedas al mirar el mapa.
- Fuentes, en orden: OpenStreetMap (Overpass) → Wikidata → Wikipedia → Wikimedia Commons → Pexels (opcional). Todas son gratuitas, sin IA.
- Si una fuente falla o no encuentra nada, se sigue con la siguiente; mejor un dato vacío que mostrar información de otro lugar.
- Overpass es un servicio público compartido y puede responder "servidor ocupado" si se lo consulta muy seguido; en ese caso el lugar queda con la info que sí se encontró (o vacío) y se puede reintentar luego desde "Buscar info del lugar".

## Zona horaria

Los horarios del itinerario se guardan como **hora local del destino** ("10:00 en Seúl") y se muestran igual para todos. La fecha límite se ingresa y se muestra en la zona horaria del viaje.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | Revisión de tipos |
| `npm run test:db` | Migraciones en Postgres en memoria + 60 pruebas de reglas y seguridad |

## Seguridad

- Organizadores: Supabase Auth + RLS.
- Viajeros: sin cuenta. El navegador nunca consulta Supabase directamente; llama a `/api/v/:token/*` y el servidor ejecuta funciones `member_*` con la secret key.
- `anon` sin acceso a nada. Las claves secretas (Supabase y, si se usa, Pexels) solo existen en el servidor.
- El admin no puede escribir votos ni respuestas de viajeros, ni la info automática de lugares a mano (solo el servidor la escribe en `place_info`).

## Reglas (en la base de datos)

| Regla | Dónde |
|---|---|
| Un voto por viajero por lugar | `PRIMARY KEY (place_id, member_id)` |
| Solo votan viajeros que confirmaron, en lugares en votación, antes de la fecha límite | `member_vote` + trigger |
| Al retractarse se borran sus votos | Trigger |
| Votos, lugares y paradas no se mezclan entre viajes | FK compuestas |
| Paradas dentro de las fechas del viaje; no se puede acortar el viaje dejando paradas fuera | Triggers |
| El itinerario solo lo ven los viajeros si está publicado | `member_get_trip` |
| Zona horaria válida | Trigger |
