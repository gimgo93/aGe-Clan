import {env} from 'cloudflare:workers';
import {accountRequest} from '../../../../lib/account-store.js';
import {recordAnalyticsEvent} from '../../../../lib/analytics-store.js';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const input=await req.clone().json().catch(()=>null),response=await accountRequest(req,env),ops:any={challenge:'google_login_challenge',save:'account_settings_save',logout:'account_logout',delete:'account_delete'};
 let event=ops[input?.op],success=response.ok;
 if(input?.op==='login'){const data=await response.clone().json().catch(()=>null);event=response.ok&&data?.account?'google_login_success':'google_login_failure';success=event==='google_login_success';}
 if(event&&input?.analytics)await recordAnalyticsEvent(env.DB,input.analytics,event,req,{source:'server',success});
 return response;
}
