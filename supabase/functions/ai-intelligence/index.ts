import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AI_LIMITS: Record<string, number> = { pro: 50, franchise: 200 };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
function buildPrompt(queryType: string, ctx: Record<string, any>, lang: string): string {
  const fr = lang !== 'en';

  switch (queryType) {
    case 'pl_summary':
      return `${fr
        ? 'Tu es un conseiller en affaires pour un restaurant rapide au Québec. Analyse ces données du mois et donne un résumé de 3-4 phrases avec le point le plus important à améliorer. Sois direct et actionnable. Réponds en français seulement.'
        : 'You are a business advisor for a Quebec fast-food restaurant. Summarize this month\'s data in 3-4 sentences with the most important improvement point. Be direct and actionable. Reply in English only.'
      }

Data:
- Month: ${ctx.month}
- Days with data: ${ctx.daysWithData}
- Estimated revenue: $${ctx.revenue}
- Labour %: ${ctx.labourPct}%`;

    case 'anomalies':
      // deno-lint-ignore no-explicit-any
      return `${fr
        ? 'Tu es conseiller pour un restaurant rapide. Explique ces anomalies de ventes en 2-3 phrases et suggère une action concrète. Réponds en français seulement.'
        : 'You are a fast-food restaurant advisor. Explain these sales anomalies in 2-3 sentences and suggest one concrete action. Reply in English only.'
      }

${(ctx.anomalies as Array<{day:string,date:string,venteNet:number,avg:number,pct:number}>)
  .map(a => `- ${a.day} ${a.date}: $${a.venteNet} (avg $${a.avg}, ${a.pct>0?'+':''}${a.pct}%)`)
  .join('\n')}`;

    case 'ordering':
      return `${fr
        ? 'Tu es conseiller restaurant. Explique cette recommandation de commande en 2-3 phrases. Mentionne les risques si applicable. Réponds en français seulement.'
        : 'You are a restaurant advisor. Explain this order recommendation in 2-3 sentences. Note key risks if applicable. Reply in English only.'
      }

Tomorrow (${ctx.day}): Ham ${ctx.hamQty}dz, Hot dog ${ctx.hotQty}dz, Sales est. $${ctx.salesEst}, Factors: ${(ctx.factors as string[]).join(', ')||'none'}, based on ${ctx.n} historical samples`;

    case 'cashiers':
      return `${fr
        ? 'Tu es conseiller restaurant. Identifie le problème principal dans ces données d\'écarts de caisse en 3 phrases. Réponds en français seulement.'
        : 'You are a restaurant advisor. Identify the top concern in these cashier variance patterns in 3 sentences. Reply in English only.'
      }

${(ctx.cashiers as Array<{name:string,n:number,cumul:number,shortCount:number,overCount:number,lossAlert:boolean}>)
  .map(c => `- ${c.name}: ${c.n} shifts, cumul ${c.cumul>=0?'+':''}$${c.cumul}${c.lossAlert?' [ALERT: cumul loss >$50]':''}, shorts: ${c.shortCount}, overs: ${c.overCount}`)
  .join('\n')}`;

    case 'network_summary':
      return `${fr
        ? 'Tu es un conseiller d\'affaires pour un réseau de franchises de restauration rapide au Québec. Analyse ces données multi-succursales et donne un résumé de 4-5 phrases: identifie le meilleur et le moins bon performeur, signale les problèmes urgents (main d\'œuvre élevée, données manquantes), et donne une recommandation concrète pour améliorer le réseau. Sois direct. Réponds en français seulement.'
        : 'You are a business advisor for a Quebec fast-food franchise network. Analyze this multi-location data and provide a 4-5 sentence summary: identify the top and bottom performer, flag urgent issues (high labour, missing data), and give one concrete recommendation to improve the network. Be direct. Reply in English only.'
      }

Network: ${ctx.totalLocations} locations, monthly total $${ctx.networkTotal}

${(ctx.locations as Array<{name:string,monthlySales:number,labourPct:number,avgDz:number,daysSinceFilled:number,isCloud:boolean}>)
  .map(l => `- ${l.name}: $${l.monthlySales}/mo, labour ${l.labourPct>0?l.labourPct.toFixed(1)+'%':'n/a'}, $/dz ${l.avgDz>0?'$'+l.avgDz.toFixed(2):'n/a'}${l.daysSinceFilled>=3?' [WARNING: '+l.daysSinceFilled+' days no data]':''}${l.isCloud?' [cloud sync]':' [local only]'}`)
  .join('\n')}`;

    default:
      return '';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { queryType, contextData, orgId, ownApiKey, lang } = await req.json();

    if (!queryType || !contextData) {
      return ok({ error: 'missing_params', message: 'Missing queryType or contextData.' });
    }

    let apiKey = ownApiKey || null;
    let usageCount = 0;
    let usageLimit = 50;

    if (!apiKey) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return ok({ error: 'no_auth', message: 'Sign-in required. Log in via Settings → Application.' });
      }

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) {
        return ok({ error: 'no_auth', message: 'Session expired. Please sign in again.' });
      }

      if (!orgId) {
        return ok({ error: 'no_org', message: 'Organization not found.' });
      }

      const { data: orgRow } = await supabaseAdmin
        .from('organizations')
        .select('plan')
        .eq('id', orgId)
        .single();

      const plan = orgRow?.plan || 'free';
      if (plan !== 'pro' && plan !== 'franchise') {
        return ok({ error: 'upgrade_required', message: 'AI analysis requires a Pro plan.' });
      }

      usageLimit = AI_LIMITS[plan] ?? 50;

      const month = new Date().toISOString().slice(0, 7);
      const { data: usageRow } = await supabaseAdmin
        .from('ai_usage')
        .select('count')
        .eq('org_id', orgId)
        .eq('month', month)
        .single();

      usageCount = usageRow?.count || 0;
      if (usageCount >= usageLimit) {
        return ok({ error: 'limit_reached', usageCount, usageLimit });
      }

      await supabaseAdmin
        .from('ai_usage')
        .upsert({ org_id: orgId, month, count: usageCount + 1 }, { onConflict: 'org_id,month' });

      usageCount++;
      apiKey = Deno.env.get('ANTHROPIC_API_KEY')!;
    }

    if (!apiKey) {
      return ok({ error: 'no_key', message: 'ANTHROPIC_API_KEY secret is not set.' });
    }

    const prompt = buildPrompt(queryType, contextData, lang || 'fr');
    if (!prompt) {
      return ok({ error: 'invalid_type', message: `Unknown queryType: ${queryType}` });
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error('Claude API error:', claudeRes.status, errBody);
      return ok({ error: 'claude_error', message: `Anthropic error (${claudeRes.status}): ${errBody.slice(0, 200)}` });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '';

    return ok({ text, usageCount, usageLimit, usedOwnKey: !!ownApiKey });

  } catch (err) {
    console.error('ai-intelligence error:', err);
    return ok({ error: 'unexpected', message: String(err) });
  }
});
