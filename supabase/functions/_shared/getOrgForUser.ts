/**
 * Resolves the org_id for an authenticated user from the database.
 * Use this instead of trusting a client-supplied orgId.
 */
export async function getOrgForUser(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('org_id')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data.org_id;
}
