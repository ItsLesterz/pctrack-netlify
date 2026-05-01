const bcrypt = require('bcryptjs');
const supabase = require('./lib/supabase');
const { signToken, requireAuth, cors } = require('./lib/auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors({}, 200);

  const path   = event.path.replace('/.netlify/functions/auth', '').replace('/api/auth', '');
  const method = event.httpMethod;

  // ── POST /api/auth/login ──
  if (path === '/login' && method === 'POST') {
    const { username, password } = JSON.parse(event.body || '{}');
    if (!username || !password) return cors({ error: 'Usuario y contraseña requeridos.' }, 400);

    const { data: users } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.trim())
      .limit(1);

    const user = users?.[0];
    if (!user || !bcrypt.compareSync(password, user.password))
      return cors({ error: 'Usuario o contraseña incorrectos.' }, 401);

    const token = signToken({ id: user.id, username: user.username, role: user.role });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Set-Cookie': `pctrack_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`,
      },
      body: JSON.stringify({ ok: true, username: user.username, role: user.role, token }),
    };
  }

  // ── POST /api/auth/logout ──
  if (path === '/logout' && method === 'POST') {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Set-Cookie': 'pctrack_token=; Path=/; Max-Age=0',
      },
      body: JSON.stringify({ ok: true }),
    };
  }

  // ── GET /api/auth/me ──
  if (path === '/me' && method === 'GET') {
    const user = requireAuth(event);
    if (!user) return cors({ error: 'No autenticado.' }, 401);
    return cors({ id: user.id, username: user.username, role: user.role });
  }

  // ── POST /api/auth/setup (seed admin on first deploy) ──
  if (path === '/setup' && method === 'POST') {
    const { data: existing } = await supabase.from('users').select('id').eq('username','admin').limit(1);
    if (existing?.length) return cors({ message: 'Admin ya existe.' });
    const hash = bcrypt.hashSync('admin123', 10);
    await supabase.from('users').insert({ username: 'admin', password: hash, role: 'admin' });
    return cors({ ok: true, message: 'Admin creado: admin / admin123' });
  }

  return cors({ error: 'Ruta no encontrada.' }, 404);
};
