import {env} from 'cloudflare:workers';
import {accountRequest} from '../../../../lib/account-store.js';
export const dynamic='force-dynamic';
export async function POST(req:Request){return accountRequest(req,env);}
