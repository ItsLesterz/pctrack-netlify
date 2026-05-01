const supabase = require('./lib/supabase');
const { requireAuth, cors, uid } = require('./lib/auth');

function today() { return new Date().toISOString().split('T')[0]; }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({}, 200);

  const user = requireAuth(event);
  if (!user) return cors({ error: 'No autenticado.' }, 401);

  // Strip prefix to get sub-path
  const rawPath = event.path
    .replace('/.netlify/functions/devices', '')
    .replace('/api/devices', '');

  const method = event.httpMethod;
  const body   = event.body ? JSON.parse(event.body) : {};

  // ── GET /api/devices ──
  if (rawPath === '' && method === 'GET') {
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return cors({ error: error.message }, 500);
    return cors(data);
  }

  // ── POST /api/devices ──
  if (rawPath === '' && method === 'POST') {
    const { name, description, status, interval_months, last_maint, location, assigned_to } = body;
    if (!name?.trim()) return cors({ error: 'El nombre es requerido.' }, 400);

    const id = uid();
    const { data, error } = await supabase.from('devices').insert({
      id, name: name.trim(),
      description: description || '',
      status: status || 'pending',
      interval_months: parseInt(interval_months) || 6,
      last_maint: last_maint || null,
      location: location || '',
      assigned_to: assigned_to || '',
    }).select().single();

    if (error) return cors({ error: error.message }, 500);

    await supabase.from('activity_log').insert({
      message: `Equipo agregado: ${name.trim()}`,
      color: 'green', device_id: id, username: user.username,
    });

    return cors(data, 201);
  }

  // ── GET /api/devices/meta/log ──
  if (rawPath === '/meta/log' && method === 'GET') {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(150);
    if (error) return cors({ error: error.message }, 500);
    return cors(data);
  }

  // ── DELETE /api/devices/meta/log ──
  if (rawPath === '/meta/log' && method === 'DELETE') {
    await supabase.from('activity_log').delete().neq('id', 0);
    return cors({ ok: true });
  }

  // ── Routes with /:id ──
  const idMatch = rawPath.match(/^\/([^/]+)(\/.*)?$/);
  if (!idMatch) return cors({ error: 'Ruta no encontrada.' }, 404);

  const id      = idMatch[1];
  const subpath = idMatch[2] || '';

  // ── GET /api/devices/:id ──
  if (subpath === '' && method === 'GET') {
    const { data, error } = await supabase.from('devices').select('*').eq('id', id).single();
    if (error) return cors({ error: 'Equipo no encontrado.' }, 404);
    return cors(data);
  }

  // ── PUT /api/devices/:id ──
  if (subpath === '' && method === 'PUT') {
    const { name, description, status, interval_months, last_maint, location, assigned_to } = body;
    if (!name?.trim()) return cors({ error: 'El nombre es requerido.' }, 400);

    const { data, error } = await supabase.from('devices').update({
      name: name.trim(),
      description: description || '',
      status: status || 'pending',
      interval_months: parseInt(interval_months) || 6,
      last_maint: last_maint || null,
      location: location || '',
      assigned_to: assigned_to || '',
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();

    if (error) return cors({ error: error.message }, 500);

    await supabase.from('activity_log').insert({
      message: `Equipo editado: ${name.trim()}`,
      color: 'blue', device_id: id, username: user.username,
    });

    return cors(data);
  }

  // ── PATCH /api/devices/:id/done ──
  if (subpath === '/done' && method === 'PATCH') {
    const { data: existing } = await supabase.from('devices').select('name').eq('id', id).single();
    if (!existing) return cors({ error: 'Equipo no encontrado.' }, 404);

    const { data, error } = await supabase.from('devices').update({
      status: 'done',
      last_maint: today(),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();

    if (error) return cors({ error: error.message }, 500);

    await supabase.from('activity_log').insert({
      message: `Mantenimiento completado: ${existing.name}`,
      color: 'green', device_id: id, username: user.username,
    });

    return cors(data);
  }

  // ── DELETE /api/devices/:id ──
  if (subpath === '' && method === 'DELETE') {
    const { data: existing } = await supabase.from('devices').select('name').eq('id', id).single();
    if (!existing) return cors({ error: 'Equipo no encontrado.' }, 404);

    await supabase.from('devices').delete().eq('id', id);
    await supabase.from('activity_log').insert({
      message: `Equipo eliminado: ${existing.name}`,
      color: 'red', username: user.username,
    });

    return cors({ ok: true });
  }

  return cors({ error: 'Ruta no encontrada.' }, 404);
};
