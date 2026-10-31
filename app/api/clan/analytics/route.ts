import {env} from 'cloudflare:workers';
import {analyticsRequest} from '../../../../lib/analytics-store.js';
export const dynamic='force-dynamic';
export async function GET(req:Request){return analyticsRequest(req,env);}
export async function POST(req:Request){return analyticsRequest(req,env);}
export async function DELETE(req:Request){return analyticsRequest(req,env);}
