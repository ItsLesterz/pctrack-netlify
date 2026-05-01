const bcrypt   = require('bcryptjs');
const supabase = require('./lib/supabase');
const { signToken, requireAuth, ok, err, uid, today } = require('./lib/helpers');

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') return ok({});

  // Extract sub-path: event.path will be like /.netlify/functions/api/auth/login
  // After redirect /api/auth/login → /.netlify/functions/api/auth/login
  const fullPath = event.path || '';
  // Remove the function prefix to get the logical path
  const path = fullPath
    .replace('/.netlify/functions/api', '')
    .replace(/\/$/, '') || '/';

  const method = event.httpMethod;
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}

  console.log(`${method} ${path}`);

  // ══════════════════════════════════════════
  // AUTH ROUTES
  // ══════════════════════════════════════════

  // POST /auth/login
  if (path === '/auth/login' && method === 'POST') {
    const { username, password } = body;
    if (!username || !password) return err('Usuario y contraseña requeridos.');

    const { data: users } = await supabase
      .from('users').select('*').eq('username', username.trim()).limit(1);

    const user = users?.[0];
    if (!user || !bcrypt.compareSync(password, user.password))
      return err('Usuario o contraseña incorrectos.', 401);

    const token = signToken({ id: user.id, username: user.username, role: user.role });
    return ok({ ok: true, username: user.username, role: user.role, token });
  }

  // POST /auth/logout
  if (path === '/auth/logout' && method === 'POST') {
    return ok({ ok: true });
  }

  // GET /auth/me
  if (path === '/auth/me' && method === 'GET') {
    const user = requireAuth(event);
    if (!user) return err('No autenticado.', 401);
    return ok({ id: user.id, username: user.username, role: user.role });
  }

  // GET /auth/setup — creates admin user on first deploy
  if (path === '/auth/setup' && method === 'GET') {
    const { data: existing } = await supabase
      .from('users').select('id').eq('username', 'admin').limit(1);
    if (existing?.length)
      return ok({ message: 'El usuario admin ya existe. Puedes iniciar sesión.' });

    const hash = bcrypt.hashSync('admin123', 10);
    const { error } = await supabase
      .from('users').insert({ username: 'admin', password: hash, role: 'admin' });

    if (error) return err('Error creando admin: ' + error.message, 500);
    return ok({ ok: true, message: 'Usuario admin creado. Credenciales: admin / admin123' });
  }

  // ══════════════════════════════════════════
  // DEVICES ROUTES (all require auth)
  // ══════════════════════════════════════════
  if (path.startsWith('/devices')) {
    const user = requireAuth(event);
    if (!user) return err('No autenticado.', 401);

    const subpath = path.replace('/devices', '') || '';

    // GET /devices
    if (subpath === '' && method === 'GET') {
      const { data, error } = await supabase
        .from('devices').select('*').order('created_at', { ascending: false });
      if (error) return err(error.message, 500);
      return ok(data);
    }

    // POST /devices
    if (subpath === '' && method === 'POST') {
      const { name, description, status, interval_months, last_maint, location, assigned_to } = body;
      if (!name?.trim()) return err('El nombre es requerido.');
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
      if (error) return err(error.message, 500);
      await supabase.from('activity_log').insert({
        message: `Equipo agregado: ${name.trim()}`,
        color: 'green', device_id: id, username: user.username,
      });
      return ok(data, 201);
    }

    // GET /devices/meta/log
    if (subpath === '/meta/log' && method === 'GET') {
      const { data, error } = await supabase
        .from('activity_log').select('*')
        .order('created_at', { ascending: false }).limit(150);
      if (error) return err(error.message, 500);
      return ok(data);
    }

    // DELETE /devices/meta/log
    if (subpath === '/meta/log' && method === 'DELETE') {
      await supabase.from('activity_log').delete().gte('id', 0);
      return ok({ ok: true });
    }

    // Routes with /:id
    const idMatch = subpath.match(/^\/([^/]+)(\/.*)?$/);
    if (idMatch) {
      const id      = idMatch[1];
      const action  = idMatch[2] || '';

      // GET /devices/:id
      if (action === '' && method === 'GET') {
        const { data, error } = await supabase.from('devices').select('*').eq('id', id).single();
        if (error) return err('Equipo no encontrado.', 404);
        return ok(data);
      }

      // PUT /devices/:id
      if (action === '' && method === 'PUT') {
        const { name, description, status, interval_months, last_maint, location, assigned_to } = body;
        if (!name?.trim()) return err('El nombre es requerido.');
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
        if (error) return err(error.message, 500);
        await supabase.from('activity_log').insert({
          message: `Equipo editado: ${data.name}`,
          color: 'blue', device_id: id, username: user.username,
        });
        return ok(data);
      }

      // PATCH /devices/:id/done
      if (action === '/done' && method === 'PATCH') {
        const { data: existing } = await supabase.from('devices').select('name').eq('id', id).single();
        if (!existing) return err('Equipo no encontrado.', 404);
        const { data, error } = await supabase.from('devices').update({
          status: 'done',
          last_maint: today(),
          updated_at: new Date().toISOString(),
        }).eq('id', id).select().single();
        if (error) return err(error.message, 500);
        await supabase.from('activity_log').insert({
          message: `Mantenimiento completado: ${existing.name}`,
          color: 'green', device_id: id, username: user.username,
        });
        return ok(data);
      }

      // DELETE /devices/:id
      if (action === '' && method === 'DELETE') {
        const { data: existing } = await supabase.from('devices').select('name').eq('id', id).single();
        if (!existing) return err('Equipo no encontrado.', 404);
        await supabase.from('devices').delete().eq('id', id);
        await supabase.from('activity_log').insert({
          message: `Equipo eliminado: ${existing.name}`,
          color: 'red', username: user.username,
        });
        return ok({ ok: true });
      }
    }
  }

  return err('Ruta no encontrada.', 404);
};
