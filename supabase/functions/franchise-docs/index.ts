import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    // User client — verifies identity
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    // Service client — storage + writes
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Verify user is authenticated
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

    // Get caller's org_id
    const { data: userData } = await svc.from('users').select('org_id').eq('id', user.id).single();
    if (!userData?.org_id) return new Response(JSON.stringify({ error: 'no_org' }), { status: 403, headers: corsHeaders });
    const callerOrgId = userData.org_id;

    const body = await req.json();
    const { action } = body;

    // Helper: verify caller owns the target orgId
    async function verifyOwner(orgId: string) {
      return orgId === callerOrgId;
    }

    if (action === 'upload') {
      const { orgId, folder, filename, fileBase64, mimeType, description } = body;
      if (!(await verifyOwner(orgId))) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });

      const fileBytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
      const storagePath = `${orgId}/${folder}/${Date.now()}_${filename}`;

      const { error: uploadErr } = await svc.storage
        .from('franchise-docs')
        .upload(storagePath, fileBytes, { contentType: mimeType || 'application/octet-stream', upsert: false });

      if (uploadErr) return new Response(JSON.stringify({ error: uploadErr.message }), { status: 500, headers: corsHeaders });

      const { data: doc, error: insertErr } = await svc
        .from('franchise_documents')
        .insert({ org_id: orgId, folder, filename, storage_path: storagePath, size_bytes: fileBytes.length, description: description || null, uploaded_by: user.id })
        .select()
        .single();

      if (insertErr) return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: corsHeaders });
      return new Response(JSON.stringify({ ok: true, doc }), { headers: corsHeaders });
    }

    if (action === 'delete_doc') {
      const { docId, storagePath, orgId } = body;
      if (!(await verifyOwner(orgId))) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });

      await svc.storage.from('franchise-docs').remove([storagePath]);
      await svc.from('franchise_documents').delete().eq('id', docId);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    if (action === 'get_signed_url') {
      const { storagePath } = body;
      // Verify caller can access this path (org_id is first path segment)
      const pathOrgId = storagePath.split('/')[0];
      const { data: orgRow } = await svc.from('organizations').select('parent_org_id').eq('id', callerOrgId).single();
      const canAccess = pathOrgId === callerOrgId || pathOrgId === orgRow?.parent_org_id;
      if (!canAccess) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });

      const { data: urlData, error: urlErr } = await svc.storage
        .from('franchise-docs')
        .createSignedUrl(storagePath, 300); // 5 min expiry

      if (urlErr) return new Response(JSON.stringify({ error: urlErr.message }), { status: 500, headers: corsHeaders });
      return new Response(JSON.stringify({ ok: true, url: urlData.signedUrl }), { headers: corsHeaders });
    }

    if (action === 'post_announcement') {
      const { orgId, title, body: annBody } = body;
      if (!(await verifyOwner(orgId))) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });

      const { data: ann, error: annErr } = await svc
        .from('franchise_announcements')
        .insert({ org_id: orgId, title, body: annBody })
        .select()
        .single();

      if (annErr) return new Response(JSON.stringify({ error: annErr.message }), { status: 500, headers: corsHeaders });
      return new Response(JSON.stringify({ ok: true, ann }), { headers: corsHeaders });
    }

    if (action === 'delete_announcement') {
      const { annId, orgId } = body;
      if (!(await verifyOwner(orgId))) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });

      await svc.from('franchise_announcements').delete().eq('id', annId);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'unknown_action' }), { status: 400, headers: corsHeaders });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
