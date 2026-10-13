// Prueba las migraciones contra Postgres real (PGlite) con un stub de Supabase
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG = fileURLToPath(new URL('../migrations', import.meta.url))
const db = new PGlite()

// ---- Stub mínimo de Supabase: roles, auth, storage, grants por defecto ----
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id), name text);
  alter table storage.objects enable row level security;
  grant all on storage.objects to authenticated;
`)

for (const f of fs.readdirSync(MIG).sort()) {
  try { await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8')); console.log('✔ migración', f) }
  catch (e) { console.error('✘ migración', f, e.message); process.exit(1) }
}

// ---- helpers ----
let pass = 0, fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✔', name) } else { fail++; console.log('  ✘', name, extra) }
}
async function as(role, uid, sql, params = []) {
  await db.exec(`set role ${role}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
  try { return await db.query(sql, params) }
  finally { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub', '', false)`) }
}
async function err(role, uid, sql, params = []) {
  try { await as(role, uid, sql, params); return null } catch (e) { return e.message }
}
const svc = (sql, params) => as('service_role', null, sql, params)
const svcErr = (sql, params) => err('service_role', null, sql, params)
const mget = async (t) => (await svc('select public.member_get_trip($1) r', [t])).rows[0].r
const mplaces = async (t) => (await svc('select public.member_list_places($1) r', [t])).rows[0].r
const addPlace = async (uid, tripId, fields, opts = {}) => (await as('authenticated', uid,
  'select public.trip_add_place($1, null, $2::jsonb, $3, $4) r',
  [tripId, JSON.stringify(fields), opts.votable ?? true, opts.description ?? null])).rows[0].r


const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const C = '33333333-3333-3333-3333-333333333333'

console.log('\nUsuarios')
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
  ($1,'ana@x.cl','{"full_name":"Ana"}'), ($2,'beto@x.cl','{}'), ($3,'caro@x.cl','{}')`, [A, B, C])
check('perfiles creados', (await db.query('select count(*)::int n from public.profiles')).rows[0].n === 3)

console.log('\nViajes y co-administradores')
const newTrip = (uid, extra = '') => as('authenticated', uid, `insert into public.trips
  (name, destination, start_date, end_date, time_zone, rsvp_deadline)
  values ('Corea 2027', 'Corea del Sur', '2027-04-10', '2027-04-20', 'Asia/Seoul', now() + interval '30 days') ${extra} returning *`)
const trip = (await newTrip(A)).rows[0]
check('A crea viaje (insert + select)', trip.owner_id === A && trip.itinerary_published === false)
check('zona horaria inválida rechazada', /Zona horaria no válida/.test(await err('authenticated', A, `insert into public.trips (name, start_date, end_date, time_zone, rsvp_deadline) values ('x','2027-01-01','2027-01-02','Marte/Olympus', now())`)))
check('fin antes del inicio rechazado', /trip_dates_valid/.test(await err('authenticated', A, `insert into public.trips (name, start_date, end_date, rsvp_deadline) values ('x','2027-01-05','2027-01-02', now())`)))
check('B no ve el viaje', (await as('authenticated', B, 'select * from public.trips')).rows.length === 0)
check('anon sin acceso', /permission denied/.test(await err('anon', null, 'select * from public.trips')))
check('B no puede asignarse admin', /Solo el creador/.test(await err('authenticated', B, 'select public.add_trip_admin($1,$2)', [trip.id, 'beto@x.cl'])))
await as('authenticated', A, 'select public.add_trip_admin($1,$2)', [trip.id, 'BETO@x.cl'])
check('A agrega a B por correo', (await as('authenticated', B, 'select * from public.trips')).rows.length === 1)
check('B (co-admin) no puede agregar a C', /Solo el creador/.test(await err('authenticated', B, 'select public.add_trip_admin($1,$2)', [trip.id, 'caro@x.cl'])))
await as('authenticated', B, `update public.trips set description = 'Primavera' where id = $1`, [trip.id])
check('B edita el viaje', (await db.query('select description from public.trips')).rows[0].description === 'Primavera')
check('nadie cambia owner_id', /permission denied/.test(await err('authenticated', A, 'update public.trips set owner_id = $2 where id = $1', [trip.id, B])))
await as('authenticated', B, 'delete from public.trips where id = $1', [trip.id])
check('B no puede borrar el viaje', (await db.query('select count(*)::int n from public.trips')).rows[0].n === 1)

console.log('\nMiembros, lugares e itinerario (admin)')
const mem = (await as('authenticated', A, `insert into public.members (trip_id, name) values
  ($1,'Juan'), ($1,'Lucía'), ($1,'Pedro') returning id, token`, [trip.id])).rows
const [tJuan, tLucia, tPedro] = mem.map(r => r.token)
check('tokens de 32 hex', mem.every(m => /^[0-9a-f]{32}$/.test(m.token)))
check('admin no cambia el estado de un miembro', /permission denied/.test(await err('authenticated', A, `update public.members set status='accepted' where trip_id=$1`, [trip.id])))
check('C no crea miembros en viaje ajeno', /row-level security/.test(await err('authenticated', C, `insert into public.members (trip_id, name) values ($1,'x')`, [trip.id])))

const added = []
for (const [name, latitude, longitude, votable] of [
  ['Gyeongbokgung', 37.5796, 126.9770, true],
  ['N Seoul Tower', 37.5512, 126.9882, true],
  ['Hotel Myeongdong', 37.5636, 126.9850, false],
]) added.push(await addPlace(B, trip.id, { name, latitude, longitude }, { votable }))
const [pPalacio, pTorre, pHotel] = added.map(r => r.place_id)
const [, cTorre] = added.map(r => r.catalog_place_id)
check('trip_add_place crea el lugar y lo marca como nuevo', added.every(r => r.created === true))
check('los lugares quedan en orden de llegada', (await db.query('select sort_order from public.places where trip_id = $1 order by sort_order', [trip.id])).rows.map(r => r.sort_order).join() === '1,2,3')
check('coordenadas fuera de rango rechazadas', /catalog_places_latitude_check/.test(await err('authenticated', A, 'select public.trip_add_place($1, null, $2::jsonb)', [trip.id, JSON.stringify({ name: 'x', latitude: 95, longitude: 0 })])))
check('admin no inserta lugares directo', /permission denied/.test(await err('authenticated', A, 'insert into public.places (trip_id, catalog_place_id) values ($1,$2)', [trip.id, cTorre])))
check('admin no lee la tabla del catálogo directo', /permission denied/.test(await err('authenticated', A, 'select * from public.catalog_places')))
check('admin solo cambia votación, orden y nota del lugar', /permission denied/.test(await err('authenticated', A, 'update public.places set catalog_place_id = $2 where id = $1', [pPalacio, cTorre])))

await as('authenticated', A, `insert into public.itinerary_stops (trip_id, place_id, day, start_time, end_time) values
  ($1, $2, '2027-04-11', '09:00', '12:00'), ($1, $3, '2027-04-10', '15:00', null)`, [trip.id, pPalacio, pHotel])
await as('authenticated', A, `insert into public.itinerary_stops (trip_id, title, day, start_time) values ($1, 'Vuelo SCL → ICN', '2027-04-10', '06:30')`, [trip.id])
check('parada fuera de las fechas rechazada', /stop_day_outside_trip/.test(await err('authenticated', A, `insert into public.itinerary_stops (trip_id, title, day) values ($1,'x','2027-05-01')`, [trip.id])))
check('parada sin lugar ni título rechazada', /stop_has_subject/.test(await err('authenticated', A, `insert into public.itinerary_stops (trip_id, day) values ($1,'2027-04-11')`, [trip.id])))
check('hora de término antes del inicio rechazada', /stop_times_valid/.test(await err('authenticated', A, `insert into public.itinerary_stops (trip_id, title, day, start_time, end_time) values ($1,'x','2027-04-11','10:00','09:00')`, [trip.id])))
check('acortar el viaje dejando paradas fuera falla', /stops_outside_new_dates/.test(await err('authenticated', A, `update public.trips set end_date='2027-04-10' where id=$1`, [trip.id])))

const otherTrip = (await newTrip(C)).rows[0]
const otherPlace = (await addPlace(C, otherTrip.id, { name: 'Busan', latitude: 35.1, longitude: 129.0 })).place_id
check('parada con lugar de otro viaje rechazada', /foreign key|violates/.test(await err('authenticated', A, `insert into public.itinerary_stops (trip_id, place_id, day) values ($1,$2,'2027-04-11')`, [trip.id, otherPlace]) ?? ''))

console.log('\nAcceso de viajeros')
check('authenticated no llama funciones member_*', /permission denied/.test(await err('authenticated', A, 'select public.member_get_trip($1)', [tJuan])))
check('anon no llama funciones member_*', /permission denied/.test(await err('anon', null, 'select public.member_get_trip($1)', [tJuan])))
check('token inválido', /MEMBER_NOT_FOUND/.test(await svcErr('select public.member_get_trip($1)', ['abc'])))
let g = await mget(tJuan)
check('ve el viaje y su estado', g.trip.name === 'Corea 2027' && g.member.status === 'pending' && g.is_open)
check('no recibe la nota interna ni ids', !('notes' in g.member) && !('id' in g.member))
check('itinerario oculto mientras no se publica', g.itinerary_published === false && g.itinerary.length === 0)
let pl = await mplaces(tJuan)
check('ve solo lugares votables (el hotel no)', pl.length === 2 && !pl.some(p => p.id === pHotel))
check('no puede votar sin confirmar', /NOT_ACCEPTED/.test(await svcErr('select public.member_vote($1,$2)', [tJuan, pPalacio])))

console.log('\nVotos')
for (const t of [tJuan, tLucia]) await svc('select public.member_respond($1,$2)', [t, 'accepted'])
pl = (await svc('select public.member_vote($1,$2) r', [tJuan, pPalacio])).rows[0].r
let palacio = pl.find(p => p.id === pPalacio)
check('Juan vota el palacio', palacio.vote_count === 1 && palacio.voted === true)
pl = (await svc('select public.member_vote($1,$2) r', [tJuan, pPalacio])).rows[0].r
check('votar dos veces el mismo lugar no suma', pl.find(p => p.id === pPalacio).vote_count === 1)
check('una fila de voto por miembro y lugar', (await db.query('select count(*)::int n from public.votes where place_id=$1', [pPalacio])).rows[0].n === 1)
await svc('select public.member_vote($1,$2)', [tJuan, pTorre])
check('Juan puede votar varios lugares distintos', (await mget(tJuan)).my_votes === 2)
pl = (await svc('select public.member_vote($1,$2) r', [tLucia, pPalacio])).rows[0].r
palacio = pl.find(p => p.id === pPalacio)
check('Lucía ve 2 votos en el palacio y el suyo marcado', palacio.vote_count === 2 && palacio.voted)
check('Lucía ve votos de la torre sin marcar como suyos', pl.find(p => p.id === pTorre).vote_count === 1 && !pl.find(p => p.id === pTorre).voted)
check('la lista no expone quién votó', !JSON.stringify(pl).includes('Juan'))
check('no puede votar un lugar no votable', /PLACE_NOT_VOTABLE/.test(await svcErr('select public.member_vote($1,$2)', [tJuan, pHotel])))
check('no puede votar lugar de otro viaje', /PLACE_NOT_FOUND/.test(await svcErr('select public.member_vote($1,$2)', [tJuan, otherPlace])))
pl = (await svc('select public.member_unvote($1,$2) r', [tLucia, pPalacio])).rows[0].r
check('Lucía quita su voto', pl.find(p => p.id === pPalacio).vote_count === 1 && !pl.find(p => p.id === pPalacio).voted)
check('admin no inserta votos directo', /permission denied/.test(await err('authenticated', A, `insert into public.votes (place_id, member_id, trip_id) values ($1,$2,$3)`, [pTorre, mem[2].id, trip.id])))
const adm = (await as('authenticated', B, `select m.name from public.votes v join public.members m on m.id = v.member_id where v.place_id = $1`, [pPalacio])).rows
check('co-admin ve quién votó', adm.length === 1 && adm[0].name === 'Juan')
check('C no ve votos ajenos', (await as('authenticated', C, 'select * from public.votes')).rows.length === 0)

console.log('\nRetractarse')
const rd = (await svc('select public.member_respond($1,$2) r', [tJuan, 'declined'])).rows[0].r
check('Juan declina y sus votos se borran', rd.member.status === 'declined' && rd.my_votes === 0)
check('el conteo baja para los demás', (await mplaces(tLucia)).find(p => p.id === pPalacio).vote_count === 0)

console.log('\nItinerario publicado')
await as('authenticated', A, 'update public.trips set itinerary_published = true where id = $1', [trip.id])
g = await mget(tPedro)
check('itinerario visible al publicar (aunque no haya confirmado)', g.itinerary.length === 3)
check('ordenado por día y hora', g.itinerary[0].title === 'Vuelo SCL → ICN' && g.itinerary[1].title === 'Hotel Myeongdong' && g.itinerary[2].start_time === '09:00')
check('hora en formato HH:MM', g.itinerary[0].start_time === '06:30' && g.itinerary[1].end_time === null)
pl = await mplaces(tPedro)
check('el hotel aparece al estar en el itinerario publicado', pl.some(p => p.id === pHotel && p.in_itinerary && !p.votable))

console.log('\nPresupuesto')
const [mJuan, mLucia, mPedro] = mem.map(r => r.id)
const uuids = ids => `{${ids.join(',')}}`
check('moneda principal CLP y presupuesto oculto por defecto', trip.budget_currency === 'CLP' && trip.budget_published === false)
const item = (await as('authenticated', A, `insert into public.budget_items (trip_id, category, name, currency, estimated_amount)
  values ($1,'lodging','Hotel','KRW',900000) returning *`, [trip.id])).rows[0]
check('admin crea ítem', item.category === 'lodging' && item.actual_amount === null)
check('C no crea ítems en viaje ajeno', /row-level security/.test(await err('authenticated', C, `insert into public.budget_items (trip_id, name, currency, estimated_amount) values ($1,'x','CLP',1)`, [trip.id])))
check('C no ve ítems ajenos', (await as('authenticated', C, 'select * from public.budget_items')).rows.length === 0)
check('anon sin acceso al presupuesto', /permission denied/.test(await err('anon', null, 'select * from public.budget_items')))
check('ítem sin montos rechazado', /budget_item_has_amount/.test(await err('authenticated', A, `insert into public.budget_items (trip_id, name, currency) values ($1,'x','CLP')`, [trip.id])))
check('moneda inválida rechazada', /budget_items_currency_check/.test(await err('authenticated', A, `insert into public.budget_items (trip_id, name, currency, estimated_amount) values ($1,'x','clp',1)`, [trip.id])))
check('gasto real sin tipo de cambio rechazado', /budget_item_rate_when_paid/.test(await err('authenticated', A, `update public.budget_items set actual_amount = 950000 where id = $1`, [item.id])))
const otherMember = (await as('authenticated', C, `insert into public.members (trip_id, name) values ($1,'Otro') returning id`, [otherTrip.id])).rows[0].id
check('pagador de otro viaje rechazado', /foreign key|violates/.test(await err('authenticated', A, `update public.budget_items set paid_by = $2 where id = $1`, [item.id, otherMember]) ?? ''))
await as('authenticated', A, `update public.budget_items set actual_amount = 950000, actual_rate = 0.73, paid_by = $2, paid_on = '2027-04-10' where id = $1`, [item.id, mJuan])
await as('authenticated', A, 'select public.set_budget_item_shares($1,$2::uuid[])', [item.id, uuids([mJuan, mLucia, mPedro])])
await as('authenticated', A, 'select public.set_budget_item_shares($1,$2::uuid[])', [item.id, uuids([mJuan, mLucia])])
check('set_budget_item_shares reemplaza a los participantes', (await db.query('select count(*)::int n from public.budget_item_shares where item_id = $1', [item.id])).rows[0].n === 2)
check('C no cambia participantes ajenos', /BUDGET_ITEM_NOT_FOUND/.test(await err('authenticated', C, 'select public.set_budget_item_shares($1,$2::uuid[])', [item.id, uuids([mJuan])])))
check('participante de otro viaje rechazado', /foreign key|violates/.test(await err('authenticated', A, 'select public.set_budget_item_shares($1,$2::uuid[])', [item.id, uuids([otherMember])]) ?? ''))
await as('authenticated', A, `insert into public.trip_exchange_rates (trip_id, currency, rate) values ($1,'KRW',0.73)`, [trip.id])
check('C no ve tipos de cambio ajenos', (await as('authenticated', C, 'select * from public.trip_exchange_rates')).rows.length === 0)
await as('authenticated', C, `insert into public.trip_exchange_rates (trip_id, currency, rate) values ($1,'KRW',0.73)`, [otherTrip.id])
const switched = await as('authenticated', C, `update public.trips set budget_currency = 'USD' where id = $1 returning budget_currency`, [otherTrip.id])
const leftover = await as('authenticated', C, 'select * from public.trip_exchange_rates where trip_id = $1', [otherTrip.id])
check('cambiar la moneda principal sin gastos pagados borra los tipos de cambio', switched.rows[0]?.budget_currency === 'USD' && leftover.rows.length === 0)
check('no se cambia la moneda principal con gastos pagados', /budget_currency_locked/.test(await err('authenticated', A, `update public.trips set budget_currency = 'USD' where id = $1`, [trip.id])))

const tmp = (await as('authenticated', A, `insert into public.members (trip_id, name) values ($1,'Temporal') returning id`, [trip.id])).rows[0].id
const tmpItem = (await as('authenticated', A, `insert into public.budget_items (trip_id, name, currency, actual_amount, actual_rate, paid_by)
  values ($1,'Taxi','CLP',10000,1,$2) returning id`, [trip.id, tmp])).rows[0].id
await as('authenticated', A, 'delete from public.members where id = $1', [tmp])
const orphan = (await db.query('select paid_by, trip_id from public.budget_items where id = $1', [tmpItem])).rows[0]
check('borrar al pagador deja paid_by en null y conserva el ítem', orphan.paid_by === null && orphan.trip_id === trip.id)
await as('authenticated', A, 'delete from public.budget_items where id = $1', [tmpItem])

g = await mget(tLucia)
check('presupuesto oculto mientras no se publica', g.budget_published === false && g.budget === null)
await as('authenticated', A, 'update public.trips set budget_published = true where id = $1', [trip.id])
g = await mget(tLucia)
check('presupuesto visible al publicar', g.budget_published === true && g.budget.currency === 'CLP' && g.budget.items.length === 1 && g.budget.items[0].member_ids.length === 2)
check('los montos llegan como número', g.budget.items[0].actual_amount === 950000 && g.budget.items[0].actual_rate === 0.73 && g.budget.items[0].estimated_amount === 900000)
check('incluye su id, los viajeros y los cambios, sin tokens', g.budget.me === mLucia && g.budget.members.length === 3 && g.budget.rates[0].currency === 'KRW' && !JSON.stringify(g.budget).includes(tJuan))

console.log('\nExtras de las entradas')
const ex = v => JSON.stringify(v)
check('ítem existente queda sin extras', Array.isArray(item.extras) && item.extras.length === 0)
const ticket = (await as('authenticated', A, `insert into public.budget_items (trip_id, category, name, currency, estimated_amount, extras)
  values ($1,'tickets','Palacio','KRW',20000,$2::text::jsonb) returning *`, [trip.id, ex([{ name: 'Audioguía', amount: 3000 }])])).rows[0]
check('admin crea una entrada con extras', ticket.extras.length === 1 && ticket.extras[0].name === 'Audioguía' && ticket.extras[0].amount === 3000)
const setExtras = v => err('authenticated', A, 'update public.budget_items set extras = $2::text::jsonb where id = $1', [ticket.id, ex(v)])
check('extra sin nombre rechazado', /budget_items_extras_valid/.test(await setExtras([{ name: '  ', amount: 1 }])))
check('extra con nombre de 121 caracteres rechazado', /budget_items_extras_valid/.test(await setExtras([{ name: 'x'.repeat(121), amount: 1 }])))
check('extra con monto negativo rechazado', /budget_items_extras_valid/.test(await setExtras([{ name: 'x', amount: -1 }])))
check('extra con monto como texto rechazado', /budget_items_extras_valid/.test(await setExtras([{ name: 'x', amount: '3000' }])))
check('extra sin monto rechazado', /budget_items_extras_valid/.test(await setExtras([{ name: 'x' }])))
check('extra con claves de más rechazado', /budget_items_extras_valid/.test(await setExtras([{ name: 'x', amount: 1, paid_by: 'y' }])))
check('extras que no son un arreglo rechazados', /budget_items_extras_valid/.test(await setExtras({ name: 'x', amount: 1 })))
check('extras con null de JSON rechazados', /budget_items_extras_valid/.test(await setExtras(null)))
const many = n => Array.from({ length: n }, (_, i) => ({ name: `Extra ${i}`, amount: 1 }))
check('más de 20 extras rechazados', /budget_items_extras_valid/.test(await setExtras(many(21))))
check('20 extras aceptados', (await as('authenticated', A, 'update public.budget_items set extras = $2::text::jsonb where id = $1 returning jsonb_array_length(extras) n', [ticket.id, ex(many(20))])).rows[0].n === 20)
check('extras en un ítem que no es entrada rechazados', /budget_items_extras_only_tickets/.test(await err('authenticated', A, 'update public.budget_items set extras = $2::text::jsonb where id = $1', [item.id, ex([{ name: 'x', amount: 1 }])])))
check('cambiar la categoría sin quitar los extras se rechaza', /budget_items_extras_only_tickets/.test(await err('authenticated', A, `update public.budget_items set category = 'other' where id = $1`, [ticket.id])))
check('C no modifica extras ajenos', (await as('authenticated', C, `update public.budget_items set extras = '[]'::jsonb where id = $1 returning id`, [ticket.id])).rows.length === 0)
await as('authenticated', A, 'update public.budget_items set extras = $2::text::jsonb where id = $1', [ticket.id, ex([{ name: 'Audioguía', amount: 3000 }, { name: 'Foto', amount: 1500 }])])
g = await mget(tLucia)
const gTicket = g.budget.items.find(i => i.id === ticket.id)
check('el viajero ve los extras en orden y con monto numérico', gTicket.extras.length === 2 && gTicket.extras[0].name === 'Audioguía' && gTicket.extras[1].amount === 1500)
check('al viajero los ítems sin extras le llegan con []', g.budget.items.find(i => i.id === item.id).extras.length === 0)
check('cambiar la categoría quitando los extras funciona', (await as('authenticated', A, `update public.budget_items set category = 'other', extras = '[]'::jsonb where id = $1 returning category`, [ticket.id])).rows[0].category === 'other')
await as('authenticated', A, 'delete from public.budget_items where id = $1', [ticket.id])

console.log('\nInfo automática')
check('sin place_info, info = null', (await mplaces(tPedro)).find(p => p.id === pTorre).info === null)
await db.query(`insert into public.place_info (catalog_place_id, history) values ($1,'Torre icónica')`, [cTorre])
check('con place_info, se muestra', (await mplaces(tPedro)).find(p => p.id === pTorre).info.history === 'Torre icónica')
check('el viajero recibe los mismos campos de siempre', Object.keys((await mplaces(tPedro))[0]).sort().join() === 'address,category,description,id,in_itinerary,info,latitude,longitude,name,photo_path,votable,vote_count,voted')
check('la parada sin título toma el nombre del lugar', (await mget(tPedro)).itinerary.some(s => s.title === 'Gyeongbokgung' || s.title === 'N Seoul Tower'))

console.log('\nFecha límite')
await db.query(`update public.trips set rsvp_deadline = now() - interval '1 minute' where id = $1`, [trip.id])
check('is_open = false', (await mget(tLucia)).is_open === false)
check('no puede responder', /DEADLINE_PASSED/.test(await svcErr('select public.member_respond($1,$2)', [tLucia, 'declined'])))
check('no puede votar', /DEADLINE_PASSED/.test(await svcErr('select public.member_vote($1,$2)', [tLucia, pTorre])))
check('no puede quitar votos', /DEADLINE_PASSED/.test(await svcErr('select public.member_unvote($1,$2)', [tLucia, pTorre])))
check('sigue viendo itinerario y lugares', (await mget(tLucia)).itinerary.length === 3 && (await mplaces(tLucia)).length === 3)

console.log('\nStorage')
check('B sube foto a su viaje', !(await err('authenticated', B, `insert into storage.objects (bucket_id, name) values ('place-photos', $1)`, [`${trip.id}/a.webp`])))
check('C no sube al viaje de A', /row-level security/.test(await err('authenticated', C, `insert into storage.objects (bucket_id, name) values ('place-photos', $1)`, [`${trip.id}/x.webp`])))

console.log('\nBorrar')
await as('authenticated', A, 'delete from public.places where id=$1', [pPalacio])
check('borrar un lugar quita sus paradas y votos', (await db.query('select count(*)::int n from public.itinerary_stops where place_id=$1', [pPalacio])).rows[0].n === 0)
await as('authenticated', A, 'delete from public.trips where id=$1', [trip.id])
check('borrar viaje borra todo en cascada', (await db.query('select (select count(*) from public.members where trip_id=$1)::int + (select count(*) from public.places where trip_id=$1)::int + (select count(*) from public.itinerary_stops where trip_id=$1)::int n', [trip.id])).rows[0].n === 0)

console.log(`\n${pass} ok, ${fail} fallidas`)
process.exit(fail ? 1 : 0)
