import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function studentAuthEmail(studentId: string) {
  const bytes = new TextEncoder().encode(studentId.trim().toUpperCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return 'student-' + hash + '@login.findback.invalid';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Use a POST request.' }, 405);

  const authorization = request.headers.get('Authorization') || '';
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const secretKey = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!accessToken || !supabaseUrl || !secretKey) {
    return response({ error: 'The account service is not configured.' }, 500);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !authData.user) return response({ error: 'Please sign in again.' }, 401);

  const { data: headProfile, error: headError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (headError) return response({ error: 'Could not verify school-head access.' }, 500);
  if (!headProfile || headProfile.role !== 'head') {
    return response({ error: 'Only the school head can create student accounts.' }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch (_error) {
    return response({ error: 'Enter the account details and try again.' }, 400);
  }

  const studentIds = Array.isArray(payload.studentIds)
    ? payload.studentIds.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)
    : [];
  const password = String(payload.password || '');
  if (!studentIds.length) return response({ error: 'Enter at least one student school ID.' }, 400);
  if (studentIds.length > 10) return response({ error: 'Create no more than 10 accounts at a time.' }, 400);
  if (studentIds.some((studentId) => studentId.length > 50)) return response({ error: 'Each school ID must be 50 characters or fewer.' }, 400);
  if (new Set(studentIds).size !== studentIds.length) return response({ error: 'The list contains the same school ID more than once.' }, 400);
  if (password.length < 8) return response({ error: 'Use a starting password with at least 8 characters.' }, 400);

  const { data: existing, error: existingError } = await admin
    .from('profiles')
    .select('student_id')
    .in('student_id', studentIds);
  if (existingError) return response({ error: 'Could not check whether this school ID is already in use.' }, 500);
  if (existing && existing.length) {
    return response({ error: 'These IDs already have accounts: ' + existing.map((row) => row.student_id).join(', ') }, 409);
  }

  const { count, error: countError } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .not('student_id', 'is', null);
  if (countError) return response({ error: 'Could not check the test-account limit.' }, 500);
  if ((count || 0) + studentIds.length > 10) {
    return response({ error: 'There are only ' + Math.max(0, 10 - (count || 0)) + ' test-account spaces left.' }, 409);
  }

  const createdIds: string[] = [];
  const failedIds: string[] = [];
  const errors: string[] = [];
  for (const studentId of studentIds) {
    const email = await studentAuthEmail(studentId);
    const displayName = 'Student ' + studentId;
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        student_id: studentId,
        display_name: displayName,
        findback_account_type: 'student',
      },
      app_metadata: { findback_account_type: 'student' },
    });
    if (createError) {
      failedIds.push(studentId);
      errors.push(studentId + ': ' + (createError.message || 'account creation failed'));
    } else {
      createdIds.push(studentId);
    }
  }

  return response({ createdIds, failedIds, errors });
});
